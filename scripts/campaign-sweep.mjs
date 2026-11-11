// SPDX-License-Identifier: Apache-2.0
// Legal-command campaign completion/soak policy; no state injection or browser.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PACK_FILES, parsePack } from '../js/content.js';
import { createEngine } from '../js/core.js';
import { campaigns } from '../mods/registry.js';
const seeds = (process.env.SEEDS || '0,7,2401').split(',').map(Number);
const difficulties = (process.env.DIFFICULTIES || 'standard').split(',');
const results = [];
const sourceSha256 = Object.fromEntries(await Promise.all(['js/core.js','js/content.js','mods/registry.js','scripts/campaign-sweep.mjs'].map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
for (const c of campaigns.filter(c => c.files)) {
 const raw = Object.fromEntries(await Promise.all([...PACK_FILES,...c.files].map(async n => [n+'.txt',await fs.readFile(new URL(n+'.txt',c.base),'utf8')])));
 const p = parsePack(raw), branches = [...new Set(p.objectives.map(o=>o.branch).filter(Boolean))];
 for (const player of p.scenario.playable) for (const branch of branches) for (const difficulty of difficulties) for (const seed of seeds) {
  const play = validate => {
   const e = createEngine(p,c.hooks),s=e.createGame(seed,difficulty,true,player);let orders=0;
   while(s.winner===null&&s.turn<p.rules.turnLimit){
    const choice=e.objectives(s,player).find(o=>o.branch===branch&&o.status==='active');
    if(choice&&!s.progress.choices[`${player}:route`]){e.command(s,{type:'chooseObjective',id:choice.id},player);orders++;}
    e.ai(s,player);if(s.winner===null)e.endTurn(s);if(validate)e.validateState(s);
   }
   return {s,e,orders};
  };
  const {s,e,orders}=play(true), {s:replay}=play(false);
  if(digest(s)!==digest(replay))throw Error(`${c.id}/${player}/${branch}/${seed}: nondeterministic replay`);
  if(s.winner===null)throw Error(`${c.id}: campaign did not terminate`);
  const r={campaign:c.id,player,branch,difficulty,seed,turn:s.turn,winner:s.winner,playerWon:s.winner===player,victory:s.victory,sha256:digest(s),replayMatches:true,branchOrders:orders,completed:s.progress.completed.filter(k=>k.startsWith(player+':')),resources:s.empires.map(x=>({minerals:x.minerals,energy:x.energy,science:x.science})),colonies:s.empires.map(x=>e.colonies(s,x.id).length),ships:s.fleets.length,events:s.progress.events,saveBytes:Buffer.byteLength(e.serialize(s))};
  results.push(r);console.log(JSON.stringify({campaign:c.id,player,branch,seed,difficulty,turn:s.turn,winner:s.winner,won:r.playerWon}));
 }
}
await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/campaign-sweep.json',JSON.stringify({node:process.version,sourceSha256,policy:'engine.ai controls the chosen human via the same legal commands; desired branch selected through chooseObjective as soon as active; other empires use normal endTurn AI; no state edits. Every state validated and every run independently replayed. This is an automated policy, not manual player proof.',seeds,difficulties,results},null,2)+'\n');
