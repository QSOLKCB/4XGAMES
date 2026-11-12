// SPDX-License-Identifier: Apache-2.0
// Adapted from VANILLAJS b12f24f789da81325491f96b5c2dd786d31e96f0/tests/editor-4x.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as Flow from '../js/editor-workflow.js';
import {PACK_FILES,parsePack} from '../js/content.js';
import {createEngine} from '../js/core.js';
import {readWorkbenchProject} from '../js/workbench-bridge.js';
import {createForgeScene,makeHistory,commitHistory,undoHistory,updateEntity,validateScene} from '../vendor/vanillajs/demos/editor/model.js';
import {defaultComponents} from '../vendor/vanillajs/demos/editor/components.js';
import {createAssetLibrary,addMeshAsset,setPlacement,parseProject,serializeProject} from '../vendor/vanillajs/demos/editor/asset-foundry.js';
import * as Bridge from '../js/workbench-bridge.js';
import {writeRows} from '../js/workshop.js';
import {exportGame} from '../editor/game-export.js';
import {inventory} from '../scripts/site.mjs';

const base=Object.fromEntries(await Promise.all(PACK_FILES.map(async name=>[name+'.txt',await fs.readFile(new URL('../mods/frontier/'+name+'.txt',import.meta.url),'utf8')])));

test('campaign identity/text transactions preserve the last valid draft and independent scene undo',()=>{
  const original=Flow.makeCampaignDraft(base),scene=createForgeScene(),sceneHistory=makeHistory(scene);
  const edited=Flow.editCampaignIdentity(original,{id:'editor-universe',title:'Editor Universe',version:'1.1.0'});
  assert.equal(parsePack(edited.present).meta.id,'editor-universe');assert.equal(parsePack(original.present).meta.id,'frontier');
  const before=JSON.stringify(edited);assert.throws(()=>Flow.editCampaignFile(edited,'map.txt','0 | 999 | 0\n'));
  assert.equal(JSON.stringify(edited),before,'rejected file does not damage valid history');
  const map=Flow.campaignMapScene(edited.present),nextScene=commitHistory(sceneHistory,map);
  assert.deepEqual(undoHistory(nextScene).present,scene);assert.equal(edited.past.length,1,'scene edit never creates a campaign step');
  assert.deepEqual(Flow.travelCampaignDraft(edited,'undo').present,original.present);
  assert.deepEqual(Flow.travelCampaignDraft(Flow.travelCampaignDraft(edited,'undo'),'redo').present,edited.present);
  assert.deepEqual(parseProject(serializeProject(scene,createAssetLibrary(),{optionalGPU:false})),{scene,library:createAssetLibrary(),graphics:{optionalGPU:false}},'legacy project shape remains unchanged');
});

test('actual scene transform edits map back at2:1 scale and invalid topology stays detached',()=>{
  let draft=Flow.makeCampaignDraft(base),scene=Flow.campaignMapScene(draft.present);
  const selected=scene.objects.find(e=>e.name==='star-0').id;
  assert.equal(Flow.selectedCampaignSystem(draft.present,scene,selected),0);
  scene=updateEntity(scene,selected,{position:[-1000,21,1000]});
  draft=Flow.applyCampaignMap(draft,scene);
  assert.deepEqual(parsePack(draft.present).layout.find(s=>s.id===0),{id:0,x:-2000,y:2000});
  const saved=JSON.stringify(draft);assert.throws(()=>Flow.applyCampaignMap(draft,updateEntity(scene,selected,{name:'broken-star'})),/star-N/);assert.equal(JSON.stringify(draft),saved);
  draft=Flow.editCampaignLane(draft,0,29,true);const pack=parsePack(draft.present);assert.ok(pack.map[0].links.includes(29)&&pack.map[29].links.includes(0));
  assert.throws(()=>Flow.editCampaignHome(draft,0,pack.empires[1].home),/home|start/i);
  assert.equal(parsePack(draft.present).empires[0].home,parsePack(base).empires[0].home);
});

test('selected mesh projection preserves distinct declared sources and starts a playable reimported campaign',async()=>{
  const entity=(id,parent=null)=>({id,name:id,parent,position:[0,0,0],rotationY:0,scale:[1,1,1],color:[.3,.6,.8],body:'static',visible:true,components:defaultComponents()});
  const scene=validateScene({schemaVersion:2,name:'Source family',nextId:3,objects:[entity('entity-1'),entity('entity-2','entity-1')]}),obj='v 0 0 -1\nv 1 0 1\nv -1 0 1\nf 1 2 3\n';
  let library=createAssetLibrary();
  for(const [i,license]of ['CC-BY-4.0','MIT'].entries()){const added=addMeshAsset(library,{name:'Source '+i,sourceName:'source-'+i+'.obj',sourceSha256:'a'.repeat(64),license,text:obj});library=setPlacement(scene,added.library,'entity-'+(i+1),added.id);}
  const sourceBefore=JSON.stringify({scene,library}),projection=await Flow.previewCampaignHull(scene,library,'entity-1');
  assert.equal(projection.provenance.length,2);assert.deepEqual(new Set(projection.provenance.map(p=>p.license)),new Set(['CC-BY-4.0','MIT']));
  const draft=Flow.applyCampaignHull(Flow.makeCampaignDraft(base),'scout-0',projection),pack=parsePack(Flow.importCampaign(Flow.exportCampaign(draft.present)));
  assert.equal(pack.provenance.length,2);assert.deepEqual(pack.hulls['scout-0'].shape,projection.shape);assert.equal(JSON.stringify({scene,library}),sourceBefore);
  const bundle=readWorkbenchProject(await Flow.exportCampaignHull(draft.present,'scout-0'));assert.equal(bundle.provenance.length,2);
  const sdk=Flow.exportCampaignSDK(draft.present);assert.deepEqual(Flow.importCampaign(sdk),draft.present);
  const engine=createEngine(pack),state=engine.createGame(421);engine.validateState(state);engine.endTurn(state);assert.equal(state.turn,2);
});

test('campaign undo is bounded by both snapshot count and actual encoded bytes',()=>{
  let draft=Flow.makeCampaignDraft(base);
  for(let i=0;i<40;i++)draft=Flow.editCampaignIdentity(draft,{id:'editor-universe',title:'Revision '+i,version:'1.0.0'});
  assert.equal(draft.past.length,Flow.MAX_DRAFT_HISTORY);
  const large={...base};for(const name of ['rules','music','research','campaign'])large[name+'.txt']+='\n#'+('x'.repeat(80000))+'\n';
  draft=Flow.makeCampaignDraft(large);
  for(let i=0;i<24;i++)draft=Flow.editCampaignIdentity(draft,{id:'large-authoring',title:'Large revision '+i,version:'1.0.0'});
  assert.ok(Flow.draftHistoryBytes(draft)<=Flow.MAX_DRAFT_HISTORY_BYTES);assert.ok(draft.past.length<Flow.MAX_DRAFT_HISTORY);
  const redo=Flow.travelCampaignDraft(draft,'undo');assert.ok(Flow.draftHistoryBytes(redo)<=Flow.MAX_DRAFT_HISTORY_BYTES);
  assert.throws(()=>Flow.exportCampaignSDK(draft.present),/budget|KiB/,'native authoring never widens SDK limits');
});

test('hull bundles retain every source declaration and reject lossy native export',async()=>{
  const rows=[
    {hull:'scout-0',source:'original-a.obj',sha256:'a'.repeat(64),license:'MIT',operation:'First projection'},
    {hull:'scout-0',source:'original-b.obj',sha256:'a'.repeat(64),license:'CC-BY-4.0',operation:'Composite projection'}
  ];
  const raw=writeRows(base,'provenance',rows),text=await Bridge.exportWorkbenchHullBundle(raw,'scout-0');
  const parsed=Bridge.readWorkbenchProject(text);assert.deepEqual(parsed.provenance,rows);
  await assert.rejects(Bridge.exportWorkbenchHull(raw,'scout-0'),/lossless hull bundle/);
  const projected=await Bridge.importWorkbench(text),result=Bridge.applyWorkbenchHull(raw,'scout-0',projected);
  assert.deepEqual(parsePack(result).provenance,rows,'source, digest, licence and original operation all survive');
  const long=writeRows(base,'provenance',[{...rows[0],source:'a'.repeat(120)+'.obj'}]);
  await assert.rejects(Bridge.exportWorkbenchHull(long,'scout-0'),/lossless hull bundle/);
  assert.equal(Bridge.readWorkbenchProject(await Bridge.exportWorkbenchHullBundle(long,'scout-0')).provenance[0].source,'a'.repeat(120)+'.obj');
});

test('mixed primitive and imported geometry cannot lose the local-only declaration',async()=>{
  const scene=Flow.campaignMapScene(base),first=scene.objects[0];
  scene.objects[1].parent=first.id;
  const added=addMeshAsset(createAssetLibrary(),{name:'Wing',sourceName:'wing.obj',sourceSha256:'b'.repeat(64),license:'MIT',text:'v 0 0 -1\nv 1 0 1\nv -1 0 1\nf 1 2 3\n'});
  const library=setPlacement(scene,added.library,first.id,added.id);
  const projection=await Flow.previewCampaignHull(scene,library,first.id);
  assert.equal(projection.shareable,false);
  assert.deepEqual(new Set(projection.provenance.map(p=>p.license)),new Set(['MIT','OWNER-LOCAL-ONLY']));
});

test('invalid hull envelopes leave the caller draft intact and keep native budgets',async()=>{
  const text=await Bridge.exportWorkbenchHullBundle(base,'scout-0'),envelope=JSON.parse(text),before=JSON.stringify(base);
  for(const mutate of [
    x=>x.script='run()', x=>x.hull='constructor', x=>x.provenance=[{hull:'scout-0',source:'x',sha256:'a'.repeat(64),license:'MIT',operation:'bad|row'}],
    x=>x.project=' '.repeat(256*1024+1), x=>x.provenance=Array(129).fill({})
  ]){const invalid=structuredClone(envelope);mutate(invalid);assert.throws(()=>Bridge.readWorkbenchProject(JSON.stringify(invalid)));}
  assert.throws(()=>Bridge.readWorkbenchProject(' '.repeat(Bridge.MAX_HULL_BUNDLE_BYTES+1)),/512 KiB/);
  assert.equal(JSON.stringify(base),before);
});

test('scene preview exports resolve inside the actual offline Pages package',async()=>{
  const html=exportGame(createForgeScene(),createAssetLibrary(),{optionalGPU:false});
  assert.match(html,/from '\.\/vendor\/vanillajs\/demos\/editor\/game-player\.js'/);
  const files=new Set(await inventory());
  for(const name of ['editor/index.html','editor/style.css','editor/offline.js','js/editor-workflow.js','vendor/vanillajs/demos/editor/style.css'])assert.ok(files.has(name),name);
  const queued=['editor/app.js','editor/4x-panel.js','editor/offline.js','vendor/vanillajs/demos/editor/game-player.js'],seen=new Set();
  while(queued.length){
    const file=queued.pop();if(seen.has(file))continue;seen.add(file);assert.ok(files.has(file),'Unpackaged module '+file);
    const url=new URL('../'+file,import.meta.url),source=await fs.readFile(url,'utf8');
    // The upstream exporter contains a template import relative to the future
    // HTML, exercised above. All executable modules retain their native paths.
    if(file.endsWith('/game-export.js'))continue;
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){
      const target=new URL(match[1],url),root=new URL('../',import.meta.url);
      assert.ok(target.href.startsWith(root.href),'Escaping dependency '+match[1]);queued.push(decodeURIComponent(target.href.slice(root.href.length)));
    }
  }
  assert.ok(seen.size>20,'Exercise the actual renderer, math and asset dependency closure');
});
