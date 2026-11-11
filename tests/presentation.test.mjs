// SPDX-License-Identifier: Apache-2.0
// Node-only presentation contract checks. These do not replace browser layout,
// Canvas parity, accessibility, audio-device or interaction verification.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePack,PACK_FILES,OPTIONAL_PACK_FILES} from '../js/content.js';
import {createEngine} from '../js/core.js';
import {encodeSaveEnvelope,decodeSaveEnvelope,MAX_SAVE_BYTES} from '../js/save-codec.js';
import {campaigns} from '../mods/registry.js';
import * as Workshop from '../js/workshop.js';
import * as Bridge from '../js/workbench-bridge.js';

const root=new URL('../',import.meta.url);
async function templateHarness() {
  let source=await fs.readFile(new URL('js/app.js',root),'utf8');
  // Exercise production template functions with real engine/content. Only the
  // unavailable DOM/bootstrap boundary is replaced; no authoritative mutations.
  source=source.replace(/^import .*;\n/gm,'');source=source.slice(0,source.indexOf('boot().then('));
  source+=`\nglobalThis.probe={set(p,e,s){pack=p;engine=e;state=s;selected=p.empires[s.player].home;designer=null;},select(id,fleet=null){selected=id;selectedFleet=fleet;},inspector,courseCommand,fingerprint,activate,key(){return activeKey;},stored(){return localStorage.getItem(activeKey);},views(){return [galaxyView(),coloniesView(),fleetsView(),researchView(),designerView(),diplomacyView(),reportsView(),modsView(),objectiveStrip()];},workshop(p){editorFiles=p.raw;workshopHull=Object.keys(p.hulls)[0];hullDraft=null;return [workshopMapMarkup(p),workshopHullMarkup(p),workshopRecordsMarkup(p)];}};`;
  const storage=new Map();
  const node={addEventListener(){},querySelectorAll(){return[]},contains(){return false},innerHTML:'',close(){},showModal(){},style:{setProperty(){}},dataset:{}};
  const context=vm.createContext({structuredClone,parsePack,PACK_FILES,OPTIONAL_PACK_FILES,createEngine,encodeSaveEnvelope,decodeSaveEnvelope,MAX_SAVE_BYTES,campaigns,Workshop,Bridge,TextEncoder,crypto,Soundscape:class{constructor(){this.effects={};this.levels={music:.5,effects:.8};}setLevels(){}setScore(){}resume(){}},document:{querySelector(selector){return selector==='#galaxy-canvas'?null:node;},querySelectorAll(){return[];},activeElement:null,documentElement:node,addEventListener(){}},window:{addEventListener(){},scrollY:0},localStorage:{getItem(key){return storage.get(key)||null;},setItem(key,value){storage.set(key,value);}},setTimeout,clearTimeout,URL});
  context.QsolInput={GamepadReader:class{},BUTTON:{}};vm.runInContext(source,context);return context.probe;
}
test('every shipped playable empire renders command and workshop templates without changing state',async()=>{
  const probe=await templateHarness();
  for(const spec of campaigns){
    const raw={};for(const f of [...PACK_FILES,...(spec.files||[])])raw[f+'.txt']=await fs.readFile(new URL(f+'.txt',spec.base),'utf8');
    const p=parsePack(raw),e=createEngine(p,spec.hooks);
    for(const player of p.scenario.playable){
      const s=e.createGame(2401,'standard',true,player);
      for(let turn=0;turn<2;turn++){
        probe.set(p,e,s);const before=JSON.stringify(s);
        for(const html of probe.views()){assert.equal(typeof html,'string');assert.ok(!/undefined|NaN/.test(html),`${spec.id}/${player}: invalid template value`);}
        assert.equal(JSON.stringify(s),before,'presentation must be read-only');e.endTurn(s);
      }
    }
    for(const html of probe.workshop(p))assert.equal(typeof html,'string');
  }
});


test('save admission preserves legacy empire-zero slots and fingerprints optional campaign semantics',async()=>{
  const probe=await templateHarness(),fixture=JSON.parse(await fs.readFile(new URL('tests/fixtures/v1-frontier.json',root),'utf8'));
  const legacy=parsePack(fixture.pack),hash=await probe.fingerprint(legacy.raw);
  const expected=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(PACK_FILES.map(f=>legacy.raw[f+'.txt']))))).toString('hex');
  assert.equal(hash,expected,'original content fingerprints must remain discoverable');
  assert.notEqual(await probe.fingerprint({...legacy.raw,'scenario.txt':''}),hash,'an authored empty optional file is part of pack identity');
  assert.notEqual(await probe.fingerprint({...legacy.raw,'scenario.txt':''}),await probe.fingerprint({...legacy.raw,'ai.txt':''}),'optional file names are hashed too');
  await probe.activate(legacy,{},'frontier',fixture.state);
  assert.equal(probe.key(),`voidward.save.v1.frontier@1.0.0.${hash}.frontier`);
  assert.ok(probe.stored(),'activation must actually write its autosave slot');
  const saved=decodeSaveEnvelope(probe.stored());assert.equal(saved.extension,'frontier');assert.deepEqual(saved.state,createEngine(legacy).migrateState(fixture.state));
  const p=parsePack({...legacy.raw,'scenario.txt':'playable = 1,0\n'}),e=createEngine(p),s=e.createGame(2401,'standard',true,0);
  await probe.activate(p,{},null,s);assert.ok(probe.key().endsWith('.text'),'restoring empire zero must not depend on playable-list ordering');
  const pHash=await probe.fingerprint(p.raw);assert.notEqual(pHash,hash);
  assert.notEqual(await probe.fingerprint({...p.raw,'scenario.txt':'playable = 1,0\nminVictoryTurn = 2\n'}),pHash);
  await probe.activate(p,{},null,e.createGame(2401,'standard',true,1));assert.ok(probe.key().endsWith('.text.empire-1'));assert.equal(decodeSaveEnvelope(probe.stored()).state.player,1);
});

test('hidden colony, archive and enemy design changes do not alter last-seen UI',async()=>{
  const probe=await templateHarness(),fixture=JSON.parse(await fs.readFile(new URL('tests/fixtures/v1-frontier.json',root),'utf8'));
  const p=parsePack(fixture.pack),e=createEngine(p),s=e.createGame(),enemyHome=p.empires[1].home;
  e.reveal(s,0,enemyHome);probe.set(p,e,s);probe.select(enemyHome);
  const before=probe.inspector(),diplomacyBefore=probe.views()[5],changed=structuredClone(s);
  changed.planets.find(x=>x.system===enemyHome&&x.owner===1).owner=2;
  changed.empires[1].tech.industry=3;changed.empires[1].designs[2].hull='cruiser-1';
  e.validateState(changed);probe.set(p,e,changed);probe.select(enemyHome);
  assert.equal(probe.inspector(),before);assert.equal(probe.views()[5],diplomacyBefore);
  const relic=s.systems.find(x=>x.relic&&!e.observedSystems(s).has(x.id));relic.claimed=true;e.reveal(s,0,relic.id);
  probe.set(p,e,s);probe.select(relic.id);assert.ok(!probe.inspector().includes('Ancient archive detected'));
  relic.claimed=false;assert.ok(!probe.inspector().includes('Ancient archive detected'),'distant newly available archive remains hidden until observed again');
});

test('map course uses the selected task force and its slowest member',async()=>{
  const probe=await templateHarness(),fixture=JSON.parse(await fs.readFile(new URL('tests/fixtures/v1-frontier.json',root),'utf8'));
  const p=parsePack(fixture.pack),e=createEngine(p),s=e.createGame(),ships=e.fleets(s);
  e.command(s,{type:'group',name:'Convoy',fleets:ships.slice(0,2).map(x=>x.id)});
  probe.set(p,e,s);probe.select(13,ships[0].id);const command=probe.courseCommand(13);
  assert.equal(command.type,'groupMove');assert.equal(command.group,s.groups[0].id);e.command(s,command);assert.deepEqual(ships[0].path,ships[1].path);
});

test('Soundscape uses ARCADE music bus, independent levels, and releases muted sources',async()=>{
  const originalDocument=globalThis.document,originalWindow=globalThis.window;
  class Node {
    constructor(){this.connections=[];this.gain={value:0};}
    connect(node){this.connections.push(node);}
    disconnect(){this.connections=[];}
    start(){}
    stop(){}
  }
  class Context {
    constructor(){this.sampleRate=8000;this.state='running';this.destination=new Node();this.currentTime=0;}
    createGain(){return new Node();}
    createBufferSource(){return new Node();}
    createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return{length,sampleRate,getChannelData(){return data;}};}
    resume(){this.state='running';return Promise.resolve();}
    suspend(){this.state='suspended';return Promise.resolve();}
  }
  globalThis.document={hidden:false};globalThis.window={AudioContext:Context};
  let sound;
  try {
    const {Soundscape}=await import('../js/audio.js');sound=new Soundscape();
    sound.setLevels(.2,.7);sound.setScore([{note:48,duration:1}]);await sound.setEnabled(true);
    assert.equal(sound.effects.music.gain.value,.2);assert.equal(sound.effects.fx.gain.value,.7);
    const source=[...sound.sources][0];assert.ok(source);assert.equal(source.connections[0].connections[0],sound.effects.music);
    assert.ok(sound.noteBytes>0&&sound.noteBytes<=16*1024*1024);
    sound.setLevels(0,.4);assert.equal(sound.effects.music.gain.value,0);assert.equal(sound.effects.fx.gain.value,.4);
    await sound.setEnabled(false);assert.equal(sound.sources.size,0);assert.equal(sound.timer,null);assert.equal(sound.effects.ctx.state,'suspended');
  } finally {sound?.stopMusic();globalThis.document=originalDocument;globalThis.window=originalWindow;}
});
