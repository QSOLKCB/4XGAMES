// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PACK_FILES,parsePack} from '../js/content.js';
import {createEngine} from '../js/core.js';
import {campaigns} from '../mods/registry.js';

const raw=Object.fromEntries(await Promise.all(PACK_FILES.map(async name=>[name+'.txt',await fs.readFile(new URL('../mods/frontier/'+name+'.txt',import.meta.url),'utf8')])));
const make=extra=>createEngine(parsePack({...raw,...extra}));

// Deliberately retain the straightforward independently structured reference:
// one filter/reduction per owner, with the original fleet order in each sum.
function referenceIntel(e,s,system) {
  return {system,turn:s.turn,archive:s.systems[system].relic&&!s.systems[system].claimed,
    planets:s.planets.filter(p=>p.system===system).map(p=>({id:p.id,owner:p.owner})),
    fleets:s.empires.map(owner=>{
      const ships=s.fleets.filter(f=>f.system===system&&f.owner===owner.id);
      return {owner:owner.id,ships:ships.length,attack:ships.reduce((sum,f)=>sum+(owner.energy===0?Math.floor(e.designStats(f.design).attack/2):e.designStats(f.design).attack),0)};
    }).filter(f=>f.ships),current:true};
}

test('fresh intelligence aggregation preserves owner order, exact strength, and result isolation',()=>{
  const e=make(),s=e.createGame(),system=e.content.empires[0].home;
  // A mixed-owner sensor fixture exercises zero-energy and noncombatant ships.
  for(const f of s.fleets)f.system=system;
  s.empires[1].energy=0;
  const before=e.serialize(s),actual=e.systemIntel(s,system);
  assert.deepEqual(actual,referenceIntel(e,s,system));
  assert.deepEqual(actual.fleets.map(f=>f.owner),[0,1,2]);
  actual.fleets[0].attack=-1;actual.planets[0].owner=-1;
  assert.equal(e.serialize(s),before,'observations cannot mutate authoritative state');
  assert.deepEqual(e.systemIntel(s,system),referenceIntel(e,s,system));
  s.empires[1].energy=1;s.fleets.pop();s.systems[system].claimed=true;
  assert.deepEqual(e.systemIntel(s,system),referenceIntel(e,s,system),'later observations see current strength, fleet membership and archives');
});

test('intelligence reuse never turns last-seen reports into live remote information',()=>{
  const e=make(),s=e.createGame(),home=e.content.empires[0].home,remote=s.systems[home].links[0];
  e.reveal(s,0,remote);const observed=e.systemIntel(s,remote);
  assert.equal(observed.current,false);
  s.planets[remote*e.content.rules.planetsPerSystem].owner=1;
  s.fleets.find(f=>f.owner===1).system=remote;
  assert.deepEqual(e.systemIntel(s,remote),observed,'remote ownership and fleet edits remain concealed');
  const own=s.fleets.find(f=>f.owner===0);own.system=remote;
  assert.deepEqual(e.systemIntel(s,remote),referenceIntel(e,s,remote),'a current friendly sensor receives the new observation');
});

test('AI component rankings are rebuilt for each empire, state and research level',()=>{
  const e=make(),high=e.createGame(7),low=e.createGame(7);
  for(const field of Object.keys(high.empires[0].tech))high.empires[0].tech[field]=3;
  e.ai(high,0);e.ai(low,0);e.ai(high,1);
  const assault=s=>s.empires[0].designs.find(d=>e.role(d,'assault'));
  assert.ok(e.designStats(assault(high)).attack>e.designStats(assault(low)).attack);
  for(const s of [high,low])for(const owner of s.empires)for(const design of owner.designs)
    assert.doesNotThrow(()=>e.checkDesign(design,owner.tech,owner.id));
  for(const field of Object.keys(low.empires[0].tech))low.empires[0].tech[field]=3;
  e.ai(low,0);
  assert.deepEqual(assault(low).parts,assault(high).parts,'a later technology change is never hidden by a previous ranking');
});

test('AI ranking identity includes live catalogue values without retaining mutable outputs',()=>{
  const components=raw['components.txt']+'\nchoice-high | High rank test cannon | weapon | 1 | 1 | 0 | 80 | 0 | weapons | 1 | A test cannon.\nchoice-low | Low rank test cannon | weapon | 1 | 1 | 0 | 40 | 0 | weapons | 1 | A test cannon.\n';
  const e=make({'components.txt':components}),a=e.createGame(7);
  e.ai(a,0);assert.ok(a.empires[0].designs.some(d=>d.parts.includes('choice-high')));
  e.content.components['choice-low'].attack=90;
  const b=e.createGame(7);e.ai(b,0);
  assert.ok(b.empires[0].designs.some(d=>d.parts.includes('choice-low')));
  assert.ok(a.empires[0].designs.some(d=>d.parts.includes('choice-high')),'previous snapshots keep their own installed part IDs');
});

test('the five original campaigns retain independent baseline simulation witnesses',async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/engine-reuse-baseline.json',import.meta.url),'utf8'));
  assert.equal(fixture.baselineCommit,'11c0fa582e1b28953f0df8f2a7a5f7217cb08953');
  assert.equal(fixture.runs.length,5);
  const hash=value=>createHash('sha256').update(value).digest('hex');
  for(const run of fixture.runs){
    const spec=campaigns.find(c=>c.id===run.campaign);
    const files=Object.fromEntries(await Promise.all([...PACK_FILES,...(spec.files||[])].map(async name=>[name+'.txt',await fs.readFile(new URL(name+'.txt',spec.base),'utf8')])));
    assert.equal(hash(JSON.stringify(files)),run.rawPackSha256,run.campaign+' preserves the original text pack');
    const e=createEngine(parsePack(files),spec.hooks),s=e.createGame(run.seed,run.difficulty,true,run.player);
    while(s.winner===null&&s.turn<Math.min(e.content.rules.turnLimit,160)){
      const choice=run.branch&&e.objectives(s).find(o=>o.branch===run.branch&&o.status==='active');
      if(choice&&!s.progress.choices[`${run.player}:route`])e.command(s,{type:'chooseObjective',id:choice.id});
      e.ai(s,run.player);if(s.winner===null)e.endTurn(s);e.validateState(s);
    }
    assert.equal(hash(e.serialize(s)),run.serializedSha256,run.campaign+' matches every authoritative baseline state field');
    assert.equal(s.turn,run.turn);assert.equal(s.winner,run.winner);
  }
});
