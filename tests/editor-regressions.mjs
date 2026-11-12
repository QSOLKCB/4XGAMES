// SPDX-License-Identifier: Apache-2.0
// PR #4 review regressions exercised through controls, exports and real pointers.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePack} from '../js/content.js';
import {validateScene,sceneWorld} from '../vendor/vanillajs/demos/editor/model.js';
import {defaultComponents} from '../vendor/vanillajs/demos/editor/components.js';
import {createAssetLibrary,addMeshAsset,addMaterialAsset,setPlacement,serializeProject,parseProject} from '../vendor/vanillajs/demos/editor/asset-foundry.js';
import {frameCamera} from '../vendor/vanillajs/demos/editor/viewport.js';
import {projectPoint} from '../vendor/vanillajs/demos/editor/gizmos.js';

const entity=(id,patch={})=>({id,name:id,parent:null,position:[0,0,0],rotationY:0,scale:[1,1,1],color:[.4,.7,.8],body:'static',visible:true,components:defaultComponents(),...patch});
const scene=(name,objects)=>validateScene({schemaVersion:2,name,nextId:objects.length+1,objects});
export async function verifyEditorRegressions(browser,base){
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage(),checks=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  page.on('request',r=>{if(!r.url().startsWith(new URL(base).origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))errors.push('External request '+r.url());});
  const c=id=>page.locator('#fourx-'+id),files=()=>page.evaluate(()=>globalThis.__editor4x.files);
  const position=axis=>page.locator(`[data-axis="position"][data-i="${axis}"]`);
  async function section(text){const summary=page.locator('#fourx-workshop summary').filter({hasText:text});if(!await summary.evaluate(e=>e.parentElement.open))await summary.click();}
  async function exported(){const pending=page.waitForEvent('download');await page.locator('#asset-save-project').click();const item=await pending;return parseProject(await readFile(await item.path(),'utf8'));}
  async function opened(s,library=createAssetLibrary()){
    await page.locator('#asset-open-project').setInputFiles({name:s.name+'.json',mimeType:'application/json',buffer:Buffer.from(serializeProject(s,library))});
    await page.waitForFunction(name=>document.querySelector('#scene-name').value===name&&document.querySelector('#status').textContent.startsWith('Loaded local asset project'),s.name);
  }
  async function drag(axis,fraction=.25,cancel=false){
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.waitForFunction(axis=>document.querySelector(`#gizmo-overlay line[data-axis="${axis}"]`)!==null,axis);
    const handle=await page.locator(`#gizmo-overlay line[data-axis="${axis}"]`).evaluate(e=>Object.fromEntries(['x1','y1','x2','y2'].map(k=>[k,Number(e.getAttribute(k))]))),box=await page.locator('#view').boundingBox();
    const dx=handle.x2-handle.x1,dy=handle.y2-handle.y1;assert.ok(Math.hypot(dx,dy)>20,'visible, pickable axis length');
    const start={x:box.x+handle.x1+dx*.75,y:box.y+handle.y1+dy*.75};
    assert.ok(start.x>box.x&&start.x<box.x+box.width&&start.y>box.y&&start.y<box.y+box.height,'handle must be inside viewport');
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx*fraction,start.y+dy*fraction,{steps:6});
    if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
  }
  try{
    await page.goto(base+'editor/index.html#fourx');await page.waitForFunction(()=>globalThis.__editor4x&&!document.querySelector('#fourx-export').disabled&&document.documentElement.dataset.editorReady==='ready');
    const ship=scene('Review ship fixture',[entity('entity-1')]);
    const mesh=addMeshAsset(createAssetLibrary(),{name:'Offset wing',sourceName:'offset-wing.obj',sourceSha256:'a'.repeat(64),license:'MIT',text:'v 10 0 0\nv 12 0 0\nv 10 2 0\nf 1 2 3\n'});
    const paint=addMaterialAsset(mesh.library,{name:'Red paint',license:'MIT',color:[1,.2,.1],textureId:null});
    const library=setPlacement(ship,paint.library,'entity-1',mesh.id,paint.id);
    await opened(ship,library);const before=await exported();await section('Galaxy in the 3D viewport');await c('map-scene').click();
    let current=await exported();assert.deepEqual(current.library.placements,[]);assert.deepEqual(current.library.assets,before.library.assets);
    await page.locator('#undo').click();assert.deepEqual((await exported()).library,before.library);assert.deepEqual((await exported()).scene,before.scene);
    await page.locator('#redo').click();assert.deepEqual((await exported()).library.placements,[]);
    await page.locator('#asset-list').selectOption(mesh.id);await page.locator('#asset-attach').click();await page.locator('#asset-list').selectOption(paint.id);await page.locator('#asset-attach').click();
    const mappedAttachments=(await exported()).library.placements;assert.equal(mappedAttachments.length,1);
    await c('map-scene').click();assert.deepEqual((await exported()).library.placements,[]);
    await page.locator('#undo').click();assert.deepEqual((await exported()).library.placements,mappedAttachments);
    await page.locator('#redo').click();assert.deepEqual((await exported()).library.placements,[]);
    await section('Selected geometry');await c('project').click();await page.waitForFunction(()=>!document.querySelector('#fourx-project-apply').disabled);await c('project-apply').click();
    assert.deepEqual(new Set(parsePack(await files()).provenance.map(p=>p.license)),new Set(['OWNER-LOCAL-ONLY']));
    checks.push('map-placement-reset-with-undo-redo-and-identical-scene');

    await section('Campaign text files');await c('file').selectOption('layout.txt');assert.equal(await c('text').inputValue(),'');await c('file').selectOption('campaign.txt');
    await position(0).fill('160');await position(0).press('Tab');await c('map-apply').click();
    await c('file').selectOption('layout.txt');const layout=(await files())['layout.txt'];assert.ok(layout.length);assert.equal(await c('text').inputValue(),layout);
    await c('text-apply').click();assert.equal((await files())['layout.txt'],layout);
    await c('file').selectOption('map.txt');await c('file').selectOption('campaign.txt');await c('lane-target').selectOption('29');await c('connect').click();await c('file').selectOption('map.txt');assert.equal(await c('text').inputValue(),(await files())['map.txt']);
    await c('file').selectOption('empires.txt');await c('file').selectOption('campaign.txt');
    const p=parsePack(await files()),home=p.map.find(s=>!p.empires.some(e=>e.home===s.id)).id;
    await page.locator(`#hierarchy [data-id="entity-${home+1}"]`).click();await c('home-empire').selectOption('0');await c('home').click();await c('file').selectOption('empires.txt');assert.equal(await c('text').inputValue(),(await files())['empires.txt']);
    await c('file').selectOption('system_names.txt');const names=await c('text').inputValue(),dirty=names+'\n# Unapplied local edit\n';await c('text').fill(dirty);await c('file').selectOption('layout.txt');
    await position(0).fill('180');await position(0).press('Tab');await c('map-apply').click();assert.equal(await c('text').inputValue(),(await files())['layout.txt'],'currently open clean text refreshes too');
    await c('file').selectOption('system_names.txt');assert.equal(await c('text').inputValue(),dirty,'genuine edits survive unrelated accepted changes');
    await c('file').selectOption('campaign.txt');const identity=await c('text').inputValue();await c('text').fill(identity+'\n# Temporary');await c('text').fill(identity);await c('file').selectOption('layout.txt');
    await c('title').fill('Review Updated Draft');await c('identity').click();await c('file').selectOption('campaign.txt');assert.equal(await c('text').inputValue(),(await files())['campaign.txt']);
    checks.push('clean-text-refresh-and-genuine-unapplied-edit-preservation');

    await c('map-scene').click();await page.locator('#hierarchy [data-id="entity-1"]').click();
    const originalX=Number(await position(0).inputValue());await drag('x');const movedX=Number(await position(0).inputValue());assert.notEqual(movedX,originalX);
    await page.locator('#undo').click();assert.equal(Number(await position(0).inputValue()),originalX);await page.locator('#redo').click();assert.equal(Number(await position(0).inputValue()),movedX);
    await c('map-apply').click();assert.equal(parsePack(await files()).layout.find(s=>s.id===0).x,movedX*2);
    const committed=(await exported()).scene;await drag('x',.2,true);assert.deepEqual((await exported()).scene,committed);
    await page.screenshot({path:'test-results/workbench/review-gizmos-galaxy.png',fullPage:true});
    await page.locator('#frame').click();await drag('z');assert.notDeepEqual((await exported()).scene,committed);
    await page.locator('#tool-rotate').click();const yaw=Number(await page.locator('#object-yaw').inputValue());await drag('y',.4);assert.notEqual(Number(await page.locator('#object-yaw').inputValue()),yaw);
    await page.locator('#tool-scale').click();const scale=Number(await page.locator('[data-axis="scale"][data-i="0"]').inputValue());await drag('x',.4);assert.ok(Number(await page.locator('[data-axis="scale"][data-i="0"]').inputValue())>scale);
    await page.screenshot({path:'test-results/workbench/review-gizmos-close.png',fullPage:true});
    await page.locator('#optional-gpu').check();await page.locator('#tool-move').click();await c('map-scene').click();const z=Number(await position(2).inputValue());await drag('z');assert.notEqual(Number(await position(2).inputValue()),z);
    assert.equal(await page.locator('#gizmo-overlay').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
    await page.screenshot({path:'test-results/workbench/review-gizmos-cpu.png',fullPage:true});
    checks.push('map-gizmo-pointer-move-rotate-scale-cancel-undo-webgl-and-cpu');

    await opened(ship,library);await page.locator('#tool-move').click();await page.locator('#frame').click();
    const box=await page.locator('#view').boundingBox();let camera=frameCamera({yaw:38,pitch:23,distance:18,target:[0,1,0]},sceneWorld(ship),'entity-1',box.width,box.height,library);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,1800);
    camera={...camera,distance:camera.distance*Math.exp(1.8)};
    // Wait for the camera requestFrame, then deselect away from every handle.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.mouse.click(box.x+8,box.y+8);assert.equal(await page.locator('#selection-name').textContent(),'No selection');
    const empty=projectPoint(camera,[0,0,0],box.width,box.height);await page.mouse.click(box.x+empty.x,box.y+empty.y);assert.equal(await page.locator('#selection-name').textContent(),'No selection');
    const triangle=projectPoint(camera,[10.5,.5,0],box.width,box.height);await page.mouse.click(box.x+triangle.x,box.y+triangle.y);assert.equal(await page.locator('#selection-name').textContent(),'entity-1');
    await page.screenshot({path:'test-results/workbench/review-offset-mesh-picking.png',fullPage:true});checks.push('offset-mesh-visible-triangle-picking-without-ghost-origin');

    const chain=scene('Review composed transforms',[0,1,2,3].map(i=>entity('entity-'+(i+1),{parent:i?'entity-'+i:null,scale:[i===3?1:100,1,1]})));
    await opened(chain);await page.locator('#hierarchy [data-id="entity-4"]').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('voidward.editor.scene-recovery.v1')||'null')?.scene.name==='Review composed transforms');
    const recovery=await page.evaluate(()=>localStorage.getItem('voidward.editor.scene-recovery.v1')),valid=await exported();
    await page.locator('[data-axis="scale"][data-i="0"]').fill('2');await page.locator('[data-axis="scale"][data-i="0"]').press('Tab');
    assert.match(await page.locator('#status').textContent(),/rejected:.*render-safe/);assert.equal(await page.locator('[data-axis="scale"][data-i="0"]').inputValue(),'1');
    assert.deepEqual(await exported(),valid);assert.equal(await page.locator('#undo').isDisabled(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('voidward.editor.scene-recovery.v1')),recovery);
    const invalid=structuredClone(chain);invalid.objects[3].scale[0]=2;
    await page.locator('#asset-open-project').setInputFiles({name:'invalid-transform.json',mimeType:'application/json',buffer:Buffer.from(serializeProject(invalid,createAssetLibrary()))});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Project rejected:'));
    assert.deepEqual(await exported(),valid);assert.equal(await page.evaluate(()=>localStorage.getItem('voidward.editor.scene-recovery.v1')),recovery);
    checks.push('composed-transform-rejection-preserves-scene-history-and-recovery');
    assert.deepEqual(errors,[]);return checks;
  }catch(error){await page.screenshot({path:'test-results/workbench/review-regression-failure.png',fullPage:true}).catch(()=>{});error.completedChecks=[...checks];error.browserErrors=errors;throw error;}
  finally{await context.close();}
}
