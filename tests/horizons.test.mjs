// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PACK_FILES,parsePack} from '../js/content.js';
import {exportPack,importPack,exportSDKPack,importSDKPack} from '../js/workshop.js';
import {exportWorkbenchLayout,importWorkbenchLayout} from '../js/workbench-bridge.js';
import {HORIZONS,makeHorizons} from '../scripts/generate-horizons.mjs';
import {loadHorizons,playHorizons,stateDigest} from '../scripts/horizons-sweep.mjs';

const packs=await loadHorizons();
test('Horizons generation reproduces its three checked packs without including existing campaign directories',async()=>{
  const base=Object.fromEntries(await Promise.all(PACK_FILES.map(async name=>[name+'.txt',await fs.readFile(new URL(`../mods/frontier/${name}.txt`,import.meta.url),'utf8')])));
  const generated=makeHorizons(base);
  assert.deepEqual(generated.map(p=>p.id),['helix-accord','emberwake','glass-meridian']);
  for(const {id,raw} of generated)assert.deepEqual(raw,packs.find(p=>p.spec.id===id).pack.raw);
  assert.equal(new Set(packs.flatMap(({pack})=>pack.empires.map(e=>e.name))).size,9);
  assert.equal(new Set(packs.flatMap(({pack})=>Object.values(pack.hulls).map(h=>JSON.stringify(h.shape)))).size,36);
  assert.deepEqual(packs.map(({pack})=>pack.map.length),[24,32,48]);
  assert.ok(HORIZONS.every(spec=>spec.factions.length===3));
});

test('all new factions, authored maps and objectives survive native, bounded SDK and Workbench layout exchange',()=>{
  for(const {pack} of packs) {
    assert.deepEqual(importPack(exportPack(pack.raw)),pack.raw);
    const sdk=exportSDKPack(pack.raw);assert.ok(Buffer.byteLength(sdk)<=32*1024);assert.deepEqual(importSDKPack(sdk),pack.raw);
    const restored=parsePack(importWorkbenchLayout(pack.raw,exportWorkbenchLayout(pack.raw)));
    assert.deepEqual(restored.layout,pack.layout);
    assert.deepEqual(restored.map,pack.map);
    assert.deepEqual(restored.objectives,pack.objectives);
    assert.deepEqual(pack.scenario.playable,[0,1,2]);
  }
});

for(const {pack} of packs)test(`${pack.meta.id}: every faction completes both branches through legal commands with replay and save parity`,()=>{
  for(const player of pack.scenario.playable)for(const branch of new Set(pack.objectives.map(o=>o.branch).filter(Boolean))) {
    const options={player,branch,seed:0,difficulty:'standard'},first=playHorizons(pack,options);
    const imported=parsePack(importPack(exportPack(pack.raw))),second=playHorizons(imported,{...options,validate:false});
    assert.equal(first.state.winner,player,`${pack.meta.id}/${player}/${branch}: ${first.state.victory} on turn ${first.state.turn}`);
    assert.equal(first.branchOrders,1);
    assert.equal(first.state.progress.choices[`${player}:route`],branch);
    assert.ok(first.engine.objectives(first.state,player).some(o=>o.branch===branch&&o.victory&&o.status==='complete'));
    assert.ok(first.state.turn>=pack.scenario.minVictoryTurn);
    assert.equal(stateDigest(first.state),stateDigest(second.state));
    assert.deepEqual(first.engine.deserialize(first.engine.serialize(first.state)),first.state);
  }
});
