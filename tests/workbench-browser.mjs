// SPDX-License-Identifier: Apache-2.0
// Adapted from VANILLAJS b12f24f789da81325491f96b5c2dd786d31e96f0/scripts/browser-editor-4x.js.
// Packaged authoring witness for the /4XGAMES/ Pages subpath; hosted headless QA only.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {parsePack} from '../js/content.js';

export async function verifyEditor4X(browser,base){
  await mkdir('test-results/workbench',{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],checks=[],screenshots=[];
  const observe=p=>{
    p.on('pageerror',error=>errors.push(error.message));
    p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    p.on('request',r=>{if(!r.url().startsWith(new URL(base).origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))errors.push('External request '+r.url());});
  };
  context.on('page',observe);observe(page);
  const files=()=>page.evaluate(()=>globalThis.__editor4x.files),control=id=>page.locator('#fourx-'+id);
  async function download(button){const pending=page.waitForEvent('download');await button.click();const item=await pending;assert.equal(await item.failure(),null);return readFile(await item.path(),'utf8');}
  async function openSection(label){const summary=page.locator('#fourx-workshop summary').filter({hasText:label});if(!await summary.evaluate(el=>el.parentElement.open))await summary.click();}
  async function imported(text){await control('import').setInputFiles({name:'campaign.json',mimeType:'application/json',buffer:Buffer.from(text)});await page.waitForFunction(()=>document.querySelector('#fourx-status').textContent.includes('Campaign imported and validated')&&!document.querySelector('#fourx-export').disabled);}
  async function screenshot(name){await page.screenshot({path:'test-results/workbench/'+name,fullPage:true});screenshots.push(name);}
  try{
    // Seed an existing expedition; returning from the editor must not restart it.
    const oldGame=await context.newPage();await oldGame.goto(base+'index.html');
    await oldGame.waitForFunction(()=>globalThis.__voidward?.state);
    await oldGame.locator('[data-action="end"]').click();await oldGame.waitForFunction(()=>globalThis.__voidward.state.turn===2);
    const originalSave=await oldGame.evaluate(()=>localStorage.getItem(localStorage.getItem('voidward.active.v1')));
    await oldGame.evaluate(()=>localStorage.setItem('vanillajs.editor.4x-recovery.v1','other-app-recovery'));
    await oldGame.close();
    await page.goto(base+'editor/index.html#fourx');await page.waitForFunction(()=>globalThis.__editor4x&&!document.querySelector('#fourx-export').disabled&&document.documentElement.dataset.editorReady==='ready');
    assert.equal(await page.locator('#fourx-workshop>details').evaluate(el=>el.open),true);
    await control('starter').click();await page.waitForFunction(()=>document.querySelector('#fourx-status').textContent.includes('Frontier template loaded'));
    const original=await files(),nativeTemplate=await download(control('export'));await imported(nativeTemplate);assert.deepEqual(await files(),original);checks.push('native-template-import');
    await page.locator('#play').click();assert.equal(await control('identity').isDisabled(),true);assert.equal(await control('import').isDisabled(),true);await page.locator('#stop').click();assert.equal(await control('identity').isDisabled(),false);checks.push('scene-play-isolation');

    await control('id').fill('editor-browser-universe');await control('title').fill('Editor Browser Universe');await control('identity').click();
    await openSection('Campaign text files');await control('file').selectOption('system_names.txt');const names=await control('text').inputValue();await control('text').fill(names.replace(/^[^\n]+/,'Editor Beacon'));await control('text-apply').focus();await page.keyboard.press('Enter');
    assert.equal(parsePack(await files()).systemNames[0],'Editor Beacon');await control('undo').click();assert.notEqual(parsePack(await files()).systemNames[0],'Editor Beacon');await control('redo').click();assert.equal(parsePack(await files()).systemNames[0],'Editor Beacon');checks.push('text-edit-campaign-undo-redo');

    await openSection('Galaxy in the 3D viewport');await control('map-scene').click();assert.equal(await page.locator('#count').textContent(),'30');
    await page.locator('#undo').click();assert.equal(await page.locator('#count').textContent(),'4');await page.locator('#redo').click();assert.equal(await page.locator('#count').textContent(),'30');
    await page.locator('#hierarchy [data-id="entity-1"]').click();
    await page.locator('[data-axis="position"][data-i="0"]').fill('123');await page.locator('[data-axis="position"][data-i="0"]').press('Tab');
    await page.locator('[data-axis="position"][data-i="2"]').fill('234');await page.locator('[data-axis="position"][data-i="2"]').press('Tab');
    await control('map-apply').click();assert.deepEqual(parsePack(await files()).layout.find(s=>s.id===0),{id:0,x:246,y:468});
    await control('lane-target').selectOption('29');await control('connect').click();let pack=parsePack(await files());assert.ok(pack.map[0].links.includes(29)&&pack.map[29].links.includes(0));
    await control('home-empire').selectOption('0');await control('home').click();assert.equal(parsePack(await files()).empires[0].home,0);
    await page.locator('#view').focus();await page.keyboard.press('Shift+f');await screenshot('editor-4x-viewport.png');checks.push('native-viewport-positions-scene-undo-lanes-homes');

    await openSection('Selected geometry');await control('hull').selectOption('scout-0');await control('project').click();await page.waitForFunction(()=>!document.querySelector('#fourx-project-apply').disabled);await control('project-apply').click();
    assert.ok(parsePack(await files()).provenance.some(p=>p.license==='OWNER-LOCAL-ONLY'));
    await page.locator('#asset-license').selectOption('MIT');await page.locator('#asset-obj').setInputFiles({name:'editor-original-wing.obj',mimeType:'text/plain',buffer:Buffer.from('v 0 0 -1\nv 1 0 1\nv -1 0 1\nf 1 2 3\n')});
    await page.waitForFunction(()=>document.querySelector('#asset-list option')?.textContent.includes('editor-original-wing.obj'));await page.locator('#asset-list').selectOption({index:0});await page.locator('#asset-attach').click();await page.locator('#add-child').click();await page.locator('#hierarchy [data-id="entity-1"]').click();
    await control('project').click();await page.waitForFunction(()=>!document.querySelector('#fourx-project-apply').disabled);await control('project-apply').click();pack=parsePack(await files());
    assert.deepEqual(new Set(pack.provenance.map(p=>p.license)),new Set(['MIT','OWNER-LOCAL-ONLY']));
    const hull=JSON.parse(await download(control('hull-export')));assert.equal(hull.kind,'voidward.workbench-hull.v1');assert.equal(hull.provenance.length,2);checks.push('primitive-mesh-projection-all-source-provenance');

    const portable=await download(control('export')),sdk=await download(control('sdk')),expected=parsePack(JSON.parse(portable).files).raw;
    await writeFile('test-results/workbench/editor-4x-campaign.json',portable);await writeFile('test-results/workbench/editor-4x-hull.json',JSON.stringify(hull,null,2));
    await imported(portable);assert.deepEqual(await files(),expected);await imported(sdk);assert.deepEqual(await files(),expected);
    await control('import').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"kind":"voidward.text-pack.v1","files":{}}')});await page.waitForFunction(()=>document.querySelector('#fourx-status').dataset.error==='true');assert.deepEqual(await files(),expected);checks.push('native-sdk-roundtrip-invalid-admission');
    await page.reload();await page.waitForFunction(()=>globalThis.__editor4x&&!document.querySelector('#fourx-restore').disabled);await control('restore').click();assert.deepEqual(await files(),expected);checks.push('separate-campaign-recovery');

    const pending=context.waitForEvent('page');await control('play').click();const game=await pending;await game.waitForFunction(()=>globalThis.__voidward?.workshop?.files['campaign.txt'].includes('editor-browser-universe'));
    assert.equal(await game.evaluate(()=>globalThis.__voidward.state.turn),2);
    assert.equal(await game.evaluate(()=>localStorage.getItem(localStorage.getItem('voidward.active.v1'))),originalSave,'handoff must not replace the active save');
    await game.locator('[data-action="workshop-launch"]').click();await game.locator('[data-action="workshop-start"]').click();
    await game.waitForFunction(()=>globalThis.__voidward?.pack.meta.id==='editor-browser-universe'&&!document.querySelector('#dialog').open);
    assert.deepEqual(await game.evaluate(()=>globalThis.__voidward.pack.raw),expected);
    assert.equal(await game.evaluate(()=>localStorage.getItem('voidward.editor.to-game.v1')),null);await game.locator('[data-action="end"]').click();assert.equal(await game.evaluate(()=>globalThis.__voidward.state.turn),2);
    await game.locator('.nav').getByRole('button',{name:'Campaign workshop',exact:true}).click();await game.locator('[data-action="visual-workshop"]').click();await game.locator('[data-action="visual-editor-draft"]').click();await game.waitForURL('**/editor/index.html?draft=voidward');await game.waitForFunction(()=>globalThis.__editor4x?.files['campaign.txt'].includes('editor-browser-universe'));
    assert.deepEqual(await game.evaluate(()=>globalThis.__editor4x.files),expected);assert.equal(await game.evaluate(()=>localStorage.getItem('voidward.editor.to-workbench.v1')),null);await game.close();checks.push('play-exported-draft-and-return-to-editor');

    const recovery=await page.evaluate(()=>localStorage.getItem('voidward.editor.campaign-recovery.v1'));
    await page.evaluate(()=>localStorage.setItem('voidward.editor.to-workbench.v1','{"kind":"wrong"}'));await page.goto(base+'editor/index.html?draft=voidward');await page.waitForFunction(()=>document.querySelector('#fourx-status')?.textContent.includes('handoff rejected'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('voidward.editor.campaign-recovery.v1')),recovery);assert.equal(await page.evaluate(()=>localStorage.getItem('voidward.editor.to-workbench.v1')),'{"kind":"wrong"}');
    await openSection('4X campaign workshop');await control('restore').click();assert.deepEqual(await files(),expected);checks.push('invalid-handoff-preserves-recovery-and-payload');
    await page.setViewportSize({width:320,height:900});await openSection('Campaign text files');await control('file').selectOption('campaign.txt');await control('text-apply').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'320px editor must not overflow horizontally');await screenshot('editor-4x-mobile.png');checks.push('320px-keyboard-authoring');
    assert.equal(await page.evaluate(()=>localStorage.getItem('vanillajs.editor.4x-recovery.v1')),'other-app-recovery');
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    await context.setOffline(true);await page.reload();await page.waitForFunction(()=>globalThis.__editor4x&&!document.querySelector('#fourx-restore').disabled);
    await control('restore').click();assert.deepEqual(await files(),expected);
    await page.setViewportSize({width:1440,height:1000});
    await openSection('Galaxy in the 3D viewport');await control('map-scene').click();
    assert.equal(await page.locator('#count').textContent(),'30');await screenshot('editor-4x-offline.png');
    const offlinePending=context.waitForEvent('page');await control('play').click();const offlineGame=await offlinePending;
    await offlineGame.waitForFunction(()=>globalThis.__voidward?.workshop?.files['campaign.txt'].includes('editor-browser-universe'));
    assert.deepEqual(await offlineGame.evaluate(()=>globalThis.__voidward.workshop.files),expected);await offlineGame.close();
    await context.setOffline(false);checks.push('offline-editor-reload-map-and-game-handoff','separate-app-storage-and-active-save-preservation');
    assert.deepEqual(errors,[]);return{status:'PASS',checks,screenshots,artifacts:['editor-4x-campaign.json','editor-4x-hull.json'],limits:'Native project and Mod SDK budgets unchanged; campaign history separately bounded'};
  }catch(error){await page.screenshot({path:'test-results/workbench/editor-4x-failure.png',fullPage:true}).catch(()=>{});error.completedChecks=[...checks];error.browserErrors=[...errors];throw error;}
  finally{await context.close();}
}

// Standalone hosted/cloud test. Owner workstation tests require the separate
// AGENTS.md handover and owner-browser wrapper; do not run this unattended there.
if (process.argv[1] === (await import('node:url')).fileURLToPath(import.meta.url)) {
  const {createRequire}=await import('node:module'),{default:http}=await import('node:http'),{default:path}=await import('node:path');
  const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
  const stage=path.resolve(import.meta.dirname,'../_site');
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain','.svg':'image/svg+xml'};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/4XGAMES/'))throw new Error('Subpath');
      const relative=decodeURIComponent(url.pathname.slice('/4XGAMES/'.length))||'index.html',file=path.resolve(stage,relative);
      if(!file.startsWith(stage+path.sep))throw new Error('Path');
      const data=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  let browser;
  const receipt={status:'RUNNING',environment:'isolated headless browser',hardwareAcceleration:'NOT_CLAIMED'};
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
    Object.assign(receipt,await verifyEditor4X(browser,`http://127.0.0.1:${server.address().port}/4XGAMES/`));
    console.log(JSON.stringify(receipt,null,2));
  }catch(error){receipt.status='FAIL';receipt.error=error.stack;receipt.completedChecks=error.completedChecks||[];receipt.browserErrors=error.browserErrors||[];console.error(error);process.exitCode=1;}
  finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));
    await mkdir('test-results/workbench',{recursive:true});await writeFile('test-results/workbench/result.json',JSON.stringify(receipt,null,2)+'\n');
  }
}
