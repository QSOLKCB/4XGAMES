// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parsePack, PACK_FILES } from '../js/content.js';
import { createEngine } from '../js/core.js';
import { commandReadiness, chartedSystems } from '../js/command-tools.js';
const raw = Object.fromEntries(await Promise.all(PACK_FILES.map(async n => [n+'.txt', await fs.readFile(new URL(`../mods/frontier/${n}.txt`, import.meta.url), 'utf8')])));
const pack = parsePack({...raw, 'scenario.txt':'playable = 0,1,2\nvictory = legacy\n'});

test('command readiness follows the selected empire and accepted standing/production orders without changing state', () => {
  for (const owner of [0,1,2]) {
    const engine=createEngine(pack),state=engine.createGame(2401,'standard',true,owner);
    const initial=commandReadiness(state,engine);
    assert.equal(initial.idleFleets.length,3);assert.equal(initial.idleColonies.length,1);
    assert.ok(initial.idleFleets.every(f=>f.owner===owner));assert.ok(initial.idleColonies.every(p=>p.owner===owner));
    const scout=initial.idleFleets.find(f=>engine.role(f.design,'survey'));
    engine.command(state,{type:'order',fleet:scout.id,order:'explore'},owner);
    engine.command(state,{type:'build',planet:initial.idleColonies[0].id,kind:'mine'},owner);
    const before=engine.serialize(state),summary=commandReadiness(state,engine);
    assert.equal(summary.idleFleets.length,2);assert.equal(summary.idleColonies.length,0);
    assert.equal(engine.serialize(state),before);engine.validateState(state);
  }
});

test('readiness excludes hidden and stale hostile forces while exposing current sensor contacts', () => {
  const engine=createEngine(pack),state=engine.createGame(),home=pack.empires[0].home;
  const enemy=engine.fleets(state,1).find(f=>engine.designStats(f.design).attack>0);
  state.relations[0][1]=state.relations[1][0]='war';
  assert.equal(commandReadiness(state,engine).threats.length,0,'hidden enemy home is not a current contact');
  enemy.system=home;engine.reveal(state,1,home);
  assert.deepEqual(commandReadiness(state,engine).threats,[{system:home,ships:1}]);
  const remote=13,scout=engine.fleets(state)[0];scout.system=remote;enemy.system=remote;
  engine.reveal(state,0,remote);engine.reveal(state,1,remote);
  assert.deepEqual(commandReadiness(state,engine).threats,[{system:remote,ships:1}]);
  scout.system=home;
  const before=engine.serialize(state);
  assert.equal(engine.systemIntel(state,remote).current,false);
  assert.equal(commandReadiness(state,engine).threats.length,0,'last-seen forces must not become live alerts');
  assert.equal(engine.serialize(state),before);
});

test('command search lists only charted signals and preserves the authoritative campaign', () => {
  const engine=createEngine(pack),state=engine.createGame(),before=engine.serialize(state);
  const rows=chartedSystems(state,engine),visible=engine.visibleSystems(state);
  assert.deepEqual(new Set(rows.map(s=>s.id)),visible);
  const hidden=state.systems.find(s=>!visible.has(s.id));
  assert.deepEqual(chartedSystems(state,engine,hidden.name),[]);
  assert.deepEqual(chartedSystems(state,engine,'  SOL  ').map(s=>s.id),[12]);
  assert.deepEqual(chartedSystems(state,engine,'13').map(s=>s.id),[13]);
  assert.equal(rows.find(s=>s.id===13).surveyed,false);
  assert.equal(engine.serialize(state),before);
});
