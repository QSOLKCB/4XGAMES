// SPDX-License-Identifier: Apache-2.0
// Fixed differential workload. Reads an untouched baseline; never controls a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createEngine} from '../js/core.js';

const BASELINE='11c0fa582e1b28953f0df8f2a7a5f7217cb08953';
const root=path.resolve(import.meta.dirname,'..');
if(!process.argv[2])throw Error('Usage: node scripts/benchmark-engine-reuse.mjs BASELINE_CHECKOUT [OUTPUT.json]');
const baseline=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]||'test-results/engine-reuse.json');
assert.notEqual(baseline,root,'Use an independent, untouched baseline checkout.');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:baseline,encoding:'utf8'}).trim(),BASELINE,'Baseline revision must match.');
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no','--','js','mods','vendor'],{cwd:baseline,encoding:'utf8'}).trim(),'','Baseline runtime and packs must be unchanged.');
const baselineUrl=file=>pathToFileURL(path.join(baseline,file));
const {createEngine:referenceEngine}=await import(baselineUrl('js/core.js'));
const {parsePack,PACK_FILES}=await import(baselineUrl('js/content.js'));
const {campaigns}=await import(baselineUrl('mods/registry.js'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceSha256=Object.fromEntries(await Promise.all(['js/core.js','js/content.js','scripts/benchmark-engine-reuse.mjs'].map(async file=>[file,hash(await fs.readFile(path.join(root,file)))])));
const stats=values=>{const v=values.toSorted((a,b)=>a-b);return {samples:v.length,median:v[Math.floor(v.length/2)]??0,p95:v[Math.min(v.length-1,Math.floor(v.length*.95))]??0,max:v.at(-1)??0};};
const plans=[];
for(const spec of campaigns){
  const raw=Object.fromEntries(await Promise.all([...PACK_FILES,...(spec.files||[])].map(async name=>[name+'.txt',await fs.readFile(new URL(name+'.txt',spec.base),'utf8')])));
  const pack=parsePack(raw),branches=[...new Set(pack.objectives.map(o=>o.branch).filter(Boolean))];
  for(const player of pack.scenario.playable)for(const branch of branches.length?branches:[null])for(const seed of [0,7,2401])plans.push({id:spec.id,raw,hooks:spec.hooks,player,branch,seed,difficulty:'standard'});
  for(const difficulty of ['relaxed','veteran'])plans.push({id:spec.id,raw,hooks:spec.hooks,player:pack.scenario.playable[0],branch:branches[0]||null,seed:7,difficulty});
}
const stress=JSON.parse(await fs.readFile(path.join(baseline,'docs/evidence/expansion/stress-pack.json'),'utf8'));
for(const seed of [0,7])plans.push({id:'stress-64x4',raw:stress,hooks:{},player:0,branch:null,seed,difficulty:'standard',limit:120});
assert.equal(plans.length,60,'The fixed budget is 60 baseline campaign/difficulty/route workloads.');

// Deterministic warmup, excluded from observations. No exploratory timing search.
for(const make of [referenceEngine,createEngine]){
  const e=make(parsePack(plans[0].raw)),s=e.createGame(0);
  for(let i=0;i<8&&s.winner===null;i++){e.ai(s,s.player);if(s.winner===null)e.endTurn(s);}
}
const results=[];
for(const [caseIndex,plan] of plans.entries()){
  const a=referenceEngine(parsePack(structuredClone(plan.raw)),plan.hooks),b=createEngine(parsePack(structuredClone(plan.raw)),plan.hooks);
  const sa=a.createGame(plan.seed,plan.difficulty,true,plan.player),sb=b.createGame(plan.seed,plan.difficulty,true,plan.player);
  const maxTurn=Math.min(a.content.rules.turnLimit,plan.limit||160),referenceMs=[],proposedMs=[];
  assert.equal(b.serialize(sb),a.serialize(sa),'Initial state parity.');
  const step=(e,s)=>{
    const choice=plan.branch&&e.objectives(s).find(o=>o.branch===plan.branch&&o.status==='active');
    if(choice&&!s.progress.choices[`${plan.player}:route`])e.command(s,{type:'chooseObjective',id:choice.id});
    e.ai(s,plan.player);if(s.winner===null)e.endTurn(s);
  };
  while(sa.winner===null&&sa.turn<maxTurn){
    const jobs=[{e:a,s:sa,times:referenceMs},{e:b,s:sb,times:proposedMs}];
    if((sa.turn+caseIndex)%2)jobs.reverse();
    for(const {e,s,times}of jobs){const start=performance.now();step(e,s);times.push(performance.now()-start);}
    a.validateState(sa);b.validateState(sb);
    assert.equal(b.serialize(sb),a.serialize(sa),`${plan.id}/${plan.player}/${plan.branch}/${plan.difficulty}/${plan.seed}: exact state mismatch at turn ${sa.turn}`);
  }
  const text=a.serialize(sa);
  assert.deepEqual(b.deserialize(text),a.deserialize(text),'Save admission parity.');
  const result={campaign:plan.id,player:plan.player,branch:plan.branch,difficulty:plan.difficulty,seed:plan.seed,systems:sa.systems.length,planets:sa.planets.length,turn:sa.turn,winner:sa.winner,victory:sa.victory,steps:referenceMs.length,serializedSha256:hash(text),rawPackSha256:hash(JSON.stringify(plan.raw)),exactStateParity:true,referenceMs,proposedMs};
  results.push(result);
  console.log(`${results.length}/${plans.length} ${plan.id} player=${plan.player} route=${plan.branch||'legacy'} ${plan.difficulty} seed=${plan.seed}: turn ${sa.turn}, exact parity`);
}
const summaries=[...new Set(results.map(x=>x.campaign))].map(campaign=>{
  const rows=results.filter(x=>x.campaign===campaign),reference=stats(rows.flatMap(x=>x.referenceMs)),proposed=stats(rows.flatMap(x=>x.proposedMs));
  return {campaign,workloads:rows.length,referenceMs:reference,proposedMs:proposed,medianRatio:reference.median/proposed.median};
});
for(const file of Object.keys(sourceSha256))assert.equal(hash(await fs.readFile(path.join(root,file))),sourceSha256[file],'Candidate source changed during measurement.');
const receipt={schema:'voidward-engine-reuse-v1',baselineCommit:BASELINE,baselineCoreSha256:hash(await fs.readFile(path.join(baseline,'js/core.js'))),sourceSha256,environment:{node:process.version,platform:process.platform,arch:process.arch},method:'Fixed 60 workloads. Original five campaigns: seeds 0/7/2401, every playable empire and branch at standard difficulty; first playable/first route at relaxed and veteran seed 7. Two preserved 64-star/256-world stress runs stop at turn 120. Other workloads stop at a winner or turn 160. The desired branch is selected through a legal command and engine.ai drives the chosen player; every other empire uses normal endTurn AI. Baseline and proposed engines start independently, alternate execution order each step, validate every resulting state and compare every serialized byte after every step. Timings include active-player AI plus endTurn, excluding cloning, validation and comparison. One fixed eight-step warmup per implementation; no tuning search. No browser, GPU, render, input-latency or universal speedup claim.',limits:{workloads:60,maxTurn:160,stressMaxTurn:120,rankingCacheLifetime:'one synchronous AI design phase',rankingKinds:6,retainedStateDerivedCache:0},summary:{workloads:results.length,steps:results.reduce((sum,r)=>sum+r.steps,0),allExact:true},summaries,results};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({output,summary:receipt.summary,summaries},null,2));
