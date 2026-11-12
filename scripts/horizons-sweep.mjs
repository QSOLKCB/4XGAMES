// SPDX-License-Identifier: Apache-2.0
// A bounded legal-command policy, not a balance guarantee or a manual playthrough.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PACK_FILES, parsePack} from '../js/content.js';
import {createEngine} from '../js/core.js';
import {campaigns} from '../mods/registry.js';
import {HORIZONS} from './generate-horizons.mjs';

export const stateDigest = state => createHash('sha256').update(JSON.stringify(state)).digest('hex');
export async function loadHorizons() {
  return Promise.all(HORIZONS.map(async ({id})=>{
    const spec=campaigns.find(c=>c.id===id);
    if(!spec)throw new Error('Horizons pack is not registered: '+id);
    const raw=Object.fromEntries(await Promise.all([...PACK_FILES,...spec.files].map(async name=>[name+'.txt',await fs.readFile(new URL(name+'.txt',spec.base),'utf8')])));
    return {spec,pack:parsePack(raw)};
  }));
}
export function playHorizons(pack,{player=0,branch,seed=0,difficulty='standard',validate=true}={}) {
  const engine=createEngine(pack),state=engine.createGame(seed,difficulty,true,player);let branchOrders=0;
  while(state.winner===null&&state.turn<pack.rules.turnLimit) {
    const choice=engine.objectives(state,player).find(o=>o.branch===branch&&o.status==='active');
    if(choice&&!state.progress.choices[`${player}:route`]){engine.command(state,{type:'chooseObjective',id:choice.id},player);branchOrders++;}
    engine.ai(state,player);
    if(state.winner===null)engine.endTurn(state);
    if(validate)engine.validateState(state);
  }
  if(state.winner===null)throw new Error('Policy did not reach a terminal state: '+pack.meta.id);
  return {engine,state,branchOrders};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const seeds=(process.env.SEEDS||'0,7').split(',').map(Number),difficulties=(process.env.DIFFICULTIES||'standard').split(',');
  if(!seeds.length||seeds.length>4||seeds.some(s=>!Number.isInteger(s)||s<0||s>4294967295)||new Set(seeds).size!==seeds.length)throw new Error('Use 1–4 distinct uint32 seeds.');
  if(!difficulties.length||difficulties.length>3||difficulties.some(d=>!['relaxed','standard','veteran'].includes(d))||new Set(difficulties).size!==difficulties.length)throw new Error('Choose distinct relaxed, standard or veteran difficulties.');
  const files=['js/core.js','js/content.js','js/workshop.js','mods/registry.js','scripts/generate-horizons.mjs','scripts/horizons-sweep.mjs'];
  const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async name=>[name,createHash('sha256').update(await fs.readFile(new URL('../'+name,import.meta.url))).digest('hex')])));
  const sourceSha256=await hashes(),results=[];
  for(const {pack} of await loadHorizons()) {
    const branches=[...new Set(pack.objectives.map(o=>o.branch).filter(Boolean))];
    for(const player of pack.scenario.playable)for(const branch of branches)for(const difficulty of difficulties)for(const seed of seeds) {
      const {engine,state,branchOrders}=playHorizons(pack,{player,branch,seed,difficulty});
      const replay=playHorizons(pack,{player,branch,seed,difficulty,validate:false}).state;
      const sha256=stateDigest(state);if(sha256!==stateDigest(replay))throw new Error('Nondeterministic campaign: '+pack.meta.id);
      const save=engine.serialize(state);if(JSON.stringify(engine.deserialize(save))!==JSON.stringify(state))throw new Error('Save roundtrip mismatch: '+pack.meta.id);
      const result={campaign:pack.meta.id,player,branch,difficulty,seed,turn:state.turn,winner:state.winner,playerWon:state.winner===player,victory:state.victory,sha256,replayMatches:true,branchOrders,completed:state.progress.completed.filter(k=>k.startsWith(player+':')),colonies:engine.colonies(state,player).length,events:state.progress.events,saveBytes:Buffer.byteLength(save)};
      results.push(result);console.log(JSON.stringify({campaign:result.campaign,player,branch,difficulty,seed,turn:result.turn,playerWon:result.playerWon}));
    }
  }
  if(JSON.stringify(sourceSha256)!==JSON.stringify(await hashes()))throw new Error('Source changed during the sweep; receipt was not written.');
  const packSha256=Object.fromEntries((await loadHorizons()).map(({pack})=>[pack.meta.id,stateDigest(pack.raw)]));
  const receipt={node:process.version,policy:'engine.ai issues legal commands for the selected player; the requested branch is chosen as soon as available. Rivals retain their ordinary AI. Every turn validates; each run has a separate deterministic replay and exact save roundtrip. No state edits and no manual-play or universal-balance claim.',budget:{seeds,difficulties,maxTurns:170,maxScenarios:216,independentReplaysPerScenario:1},sourceSha256,packSha256,results};
  await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await fs.writeFile(new URL('../test-results/horizons-sweep.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
  console.log(`${results.length} campaigns completed; ${results.filter(r=>r.playerWon).length} player wins; every replay and save matched.`);
}
