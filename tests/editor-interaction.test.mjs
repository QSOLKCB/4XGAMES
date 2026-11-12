// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PACK_FILES} from '../js/content.js';
import {campaignMapScene} from '../js/editor-workflow.js';
import {gizmoHandles,pickGizmo,axisDragAmount,applyGizmo} from '../editor/gizmos.js';
import {pickObject} from '../editor/picking.js';
import {prepareSceneEdit,validateRenderableScene} from '../editor/scene-state.js';
import {validateScene,sceneWorld,makeHistory,undoHistory,redoHistory,updateEntity} from '../vendor/vanillajs/demos/editor/model.js';
import {defaultComponents} from '../vendor/vanillajs/demos/editor/components.js';
import {createAssetLibrary,addMeshAsset,addMaterialAsset,setPlacement,prunePlacements} from '../vendor/vanillajs/demos/editor/asset-foundry.js';
import {frameCamera,displayWorld,createSceneVertices} from '../vendor/vanillajs/demos/editor/viewport.js';

const raw=Object.fromEntries(await Promise.all(PACK_FILES.map(async f=>[f+'.txt',await fs.readFile(new URL('../mods/frontier/'+f+'.txt',import.meta.url),'utf8')])));
const entity=(id,patch={})=>({id,name:id,parent:null,position:[0,0,0],rotationY:0,scale:[1,1,1],color:[.4,.7,.8],body:'static',visible:true,components:defaultComponents(),...patch});
const scene=objects=>validateScene({schemaVersion:2,name:'Interaction fixture',nextId:objects.length+1,objects});
const obj='v 10 0 0\nv 12 0 0\nv 10 2 0\nf 1 2 3\n';
function attach(s,library=createAssetLibrary(),id='entity-1'){
  const mesh=addMeshAsset(library,{name:'Offset wing',sourceName:'wing.obj',sourceSha256:'a'.repeat(64),license:'MIT',text:obj});
  const material=addMaterialAsset(mesh.library,{name:'Paint',license:'MIT',color:[1,0,0],textureId:null});
  return setPlacement(s,material.library,id,mesh.id,material.id);
}

test('map replacement clears reused-ID mesh/material placements and retains both undo snapshots',()=>{
  const original=scene([entity('entity-1')]),library=attach(original),history=makeHistory(original),before=JSON.stringify({history,library});
  const edit=prepareSceneEdit(history,library,campaignMapScene(raw),{clearPlacements:true});
  assert.deepEqual(edit.library.placements,[]);assert.deepEqual(edit.library.assets,library.assets);
  assert.deepEqual(edit.previousPlacements,library.placements);assert.equal(JSON.stringify({history,library}),before);
  const undo=undoHistory(edit.history);assert.deepEqual(undo.present,history.present);
  assert.deepEqual(prunePlacements(undo.present,{...edit.library,placements:edit.previousPlacements}).placements,library.placements);
  assert.deepEqual(redoHistory(undo).present,edit.history.present);
  // A star attachment must also be undoable when the replacement map has the
  // exact same scene JSON; native scene-only history normally elides that step.
  const mapped=campaignMapScene(raw),sameHistory=makeHistory(mapped),sameLibrary=attach(mapped);
  const cleared=prepareSceneEdit(sameHistory,sameLibrary,mapped,{clearPlacements:true});
  assert.notEqual(cleared.history.present,sameHistory.present);
  assert.equal(cleared.history.past.length,1);assert.deepEqual(cleared.library.placements,[]);
  assert.deepEqual(cleared.previousPlacements,sameLibrary.placements);
});

test('render-unsafe composed transforms reject before changing scene history or attachments',()=>{
  const original=scene([0,1,2,3].map(i=>entity('entity-'+(i+1),{parent:i?'entity-'+i:null,scale:[i===3?1:100,1,1]})));
  assert.equal(sceneWorld(validateRenderableScene(original)).at(-1).scale[0],1e6);
  const history=makeHistory(original),library=attach(original),before=JSON.stringify({history,library});
  const candidate=updateEntity(original,'entity-4',{scale:[2,1,1]});
  assert.doesNotThrow(()=>validateScene(candidate),'local values alone are legal');
  assert.throws(()=>prepareSceneEdit(history,library,candidate),/render-safe bounds/);
  assert.equal(JSON.stringify({history,library}),before);
  assert.throws(()=>validateRenderableScene(candidate),/render-safe bounds/,'imports and previews share admission');
});

test('galaxy handles remain pickable at framed map scale and map pixel drags to world units',()=>{
  const s=campaignMapScene(raw),world=sceneWorld(s),object=world[0],width=840,height=650;
  const camera=frameCamera({yaw:38,pitch:23,distance:18,target:[0,0,0]},world,null,width,height);
  const handles=gizmoHandles(camera,object,width,height);
  assert.equal(handles.length,3);
  for(const handle of handles){
    const dx=handle.to.x-handle.from.x,dy=handle.to.y-handle.from.y;
    assert.ok(Math.hypot(dx,dy)>25,'usable CSS-pixel axis');
    const start={x:handle.from.x+dx*.8,y:handle.from.y+dy*.8};
    assert.equal(pickGizmo(handles,start.x,start.y).axis,handle.axis);
    const end={x:start.x+dx*.25,y:start.y+dy*.25};
    const amount=axisDragAmount(handle,start,end);
    assert.ok(Math.abs(amount-handle.length*.25)<1e-7);
    const moved=applyGizmo(s,object.id,'move',handle.axis,amount);
    const i=['x','y','z'].indexOf(handle.axis);
    assert.ok(Math.abs(moved.objects[0].position[i]-s.objects[0].position[i]-amount)<1e-6);
  }
});

test('gizmo screen sizing follows zoom, resize and local rotation, including yaw-only rotation handles',()=>{
  const object=entity('entity-1',{scale:[8,8,8],rotationY:73});
  for(const [width,height] of [[840,650],[320,380]])for(const distance of [18,1800]){
    const camera={yaw:38,pitch:23,distance,target:[0,0,0]},handles=gizmoHandles(camera,object,width,height,'local');
    assert.equal(handles.length,3);
    for(const h of handles)assert.ok(Math.hypot(h.to.x-h.from.x,h.to.y-h.from.y)>15);
    assert.deepEqual(gizmoHandles(camera,object,width,height,'local','rotate').map(h=>h.axis),['y']);
    assert.equal(gizmoHandles(camera,object,width,height,'local','scale').length,3);
  }
  assert.deepEqual(gizmoHandles({yaw:0,pitch:0,distance:1,target:[0,0,0]},entity('entity-1',{position:[0,0,10]}),800,600),[]);
});

test('offset imported meshes pick at their triangles and leave the empty entity origin unpickable',()=>{
  const s=scene([entity('entity-1')]),library=attach(s),world=sceneWorld(s);
  assert.equal(pickObject(world,{origin:[10.5,.5,10],dir:[0,0,-1]},library),'entity-1');
  assert.equal(pickObject(world,{origin:[0,0,10],dir:[0,0,-1]},library),null);
  assert.equal(pickObject(world,{origin:[11.8,1.8,10],dir:[0,0,-1]},library),null,'inside mesh AABB but outside the triangle');
});

test('picking matches rendered vertices after parent rotation and nonuniform composed scale',()=>{
  const parent=entity('entity-1',{position:[3,1,-4],rotationY:29,scale:[2,3,4]});parent.components.mesh.enabled=false;
  const s=scene([parent,entity('entity-2',{parent:parent.id,position:[2,1,3],rotationY:47,scale:[.5,2,1.5]})]),library=attach(s,createAssetLibrary(),'entity-2');
  const world=displayWorld(s),vertices=createSceneVertices(world,null,library);
  const points=[0,6,12].map(i=>Array.from(vertices.slice(i,i+3))),center=[0,1,2].map(k=>points.reduce((v,p)=>v+p[k]/3,0));
  const a=points[1].map((v,i)=>v-points[0][i]),b=points[2].map((v,i)=>v-points[0][i]);
  const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],normal=cross.map(v=>v/Math.hypot(...cross));
  const ray={origin:center.map((v,i)=>v+normal[i]*10),dir:normal.map(v=>-v)};
  assert.equal(pickObject(world,ray,library),'entity-2');
});

test('mesh picking chooses the nearest visible surface and keeps primitive fallback/material-only picking',()=>{
  const s=scene([entity('entity-1'),entity('entity-2',{position:[0,0,3]}),entity('entity-3',{position:[0,0,1]})]);
  let library=attach(s);library=setPlacement(s,library,'entity-2',library.placements[0].meshId);library=setPlacement(s,library,'entity-3',null,library.placements[0].materialId);
  const ray={origin:[10.5,.5,10],dir:[0,0,-1]};
  assert.equal(pickObject(sceneWorld(s),ray,library),'entity-2');
  assert.equal(pickObject(sceneWorld(updateEntity(s,'entity-2',{visible:false})),ray,library),'entity-1');
  assert.equal(pickObject(sceneWorld(s),{origin:[0,0,10],dir:[0,0,-1]},library),'entity-3');
});
