// SPDX-License-Identifier: Apache-2.0
// Packaged browser checks for the command-deck expansion. Headless hosted/cloud
// environment only; owner-workstation use remains subject to AGENTS.md handover.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { campaigns } from '../mods/registry.js';
import { PACK_FILES, parsePack } from '../js/content.js';
const root=path.resolve(import.meta.dirname,'..'),stage=path.join(root,'_site'),out=path.join(root,'test-results/command');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/4XGAMES/'))throw new Error('scope');const file=path.resolve(stage,decodeURIComponent(url.pathname.slice(9))||'index.html');if(!file.startsWith(stage+path.sep))throw new Error('path');const data=await fs.readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
const receipt={status:'RUNNING',environment:'isolated headless browser',checks:[],errors:[],httpFailures:[],externalRequests:[],limits:'Emulated touch/DPR; no physical-device, human-listening or GPU-speed claim.'};
let browser,context,page,current;
const action=name=>page.locator(`[data-action="${name}"]:visible`);
const nav=name=>page.locator('.nav').getByRole('button',{name,exact:true});
const snapshot=()=>page.evaluate(()=>globalThis.__voidward);
const close=async()=>{if(await page.locator('#dialog').evaluate(d=>d.open))await page.locator('#dialog [data-action="close"]').click();};
async function check(name,fn){current=name;await fn();receipt.checks.push(name);await fs.writeFile(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/4XGAMES/`,origin=new URL(url).origin;
  const observe=p=>{p.on('pageerror',e=>receipt.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)receipt.httpFailures.push(r.url()+' '+r.status());});p.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))receipt.externalRequests.push(r.url());});};
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
  receipt.browser=browser.version();
  context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1.25,reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(15000);observe(page);
  await page.goto(url);await page.waitForFunction(()=>globalThis.__voidward?.state&&document.querySelectorAll('.star-node').length);
  const original=JSON.stringify((await snapshot()).state);
  await check('nine-new-faction-briefings',async()=>{
    await action('new').click();
    receipt.briefings=[];
    for(const id of ['helix-accord','emberwake','glass-meridian']){
      const spec=campaigns.find(c=>c.id===id),raw=Object.fromEntries(await Promise.all([...PACK_FILES,...spec.files].map(async n=>[n+'.txt',await fs.readFile(new URL(n+'.txt',spec.base),'utf8')]))),pack=parsePack(raw);
      await page.locator('#new-pack').selectOption(id);await page.waitForFunction(id=>document.querySelector('#new-pack').value===id&&!document.querySelector('[data-action="launch"]').disabled,id);
      assert.equal(await page.locator('#new-player option').count(),3);
      for(const empire of pack.scenario.playable){await page.locator('#new-player').selectOption(String(empire));assert.match(await page.locator('#new-briefing').innerText(),new RegExp(pack.empires[empire].name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.ok(await page.locator('[data-briefing-hull]').count());receipt.briefings.push({id,empire});}
      await page.screenshot({path:path.join(out,`${id}-briefing.png`),fullPage:true});
    }
    await close();assert.equal(JSON.stringify((await snapshot()).state),original);
  });
  await check('command-search-and-idle-unit-navigation',async()=>{
    await page.keyboard.press('Control+k');await page.locator('#command-search').fill('kepler');
    assert.equal(await page.locator('#command-results button').count(),1);await page.locator('#command-results button').click();
    assert.equal((await snapshot()).selected,13);assert.equal(JSON.stringify((await snapshot()).state),original);
    await page.locator('#main').focus();await page.keyboard.press('n');const first=(await snapshot()).selectedFleet;assert.ok(first);
    await page.locator('#main').focus();await page.keyboard.press('n');assert.notEqual((await snapshot()).selectedFleet,first);
    await page.locator('#main').focus();await page.keyboard.press('h');assert.equal((await snapshot()).selected,12);
    await nav('Colonies').click();await page.locator('#search-colonies').fill('NO_SUCH_WORLD');await nav('Galaxy map').click();
    await action('idle-colonies').click();assert.equal(await page.locator('[data-filter="colonies"][data-key="mode"]').inputValue(),'idle');assert.equal(await page.locator('#search-colonies').inputValue(),'');assert.ok(await action('manage').count());
    await nav('Galaxy map').click();assert.equal(JSON.stringify((await snapshot()).state),original);
  });
  await check('pan-fit-and-star-focus-after-resize',async()=>{
    const node=page.locator('.star-node[data-id="12"]');await node.focus();const handle=await node.elementHandle();
    await page.setViewportSize({width:1320,height:940});
    await page.waitForFunction(el=>document.activeElement===el&&el.isConnected,handle);
    await page.waitForFunction(()=>{const c=document.querySelector('#galaxy-canvas');return c.width===Math.round(c.clientWidth*1.25);});
    assert.equal(await handle.evaluate(el=>el===document.querySelector('.star-node[data-id="12"]')),true);
    await page.keyboard.press('ArrowRight');assert.notEqual((await snapshot()).selected,12);
    const turn=(await snapshot()).state.turn;await page.keyboard.press('Enter');assert.equal((await snapshot()).state.turn,turn);
    await action('zoom-in').click();await action('zoom-in').click();
    const canvas=await page.locator('#galaxy-canvas').boundingBox(),before=(await snapshot()).renderer.pan;
    await page.mouse.move(canvas.x+16,canvas.y+canvas.height-20);await page.mouse.down();await page.mouse.move(canvas.x+111,canvas.y+canvas.height-70,{steps:8});await page.mouse.up();
    await page.waitForFunction(({x,y})=>__voidward.renderer.pan.x!==x||__voidward.renderer.pan.y!==y,before);
    await page.mouse.move(canvas.x+16,canvas.y+canvas.height-20);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width-20,canvas.y+canvas.height-20,{steps:8});await page.mouse.up();
    await page.locator('.star-node[data-id="12"]').focus();
    assert.ok(await page.locator('.star-node[data-id="12"]').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.chart-viewport').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;}),'focused offscreen star is brought into view');
    assert.deepEqual(await page.locator('.chart-viewport').evaluate(el=>[el.scrollLeft,el.scrollTop]),[0,0]);
    await action('zoom-reset').click();assert.deepEqual((await snapshot()).renderer.pan,{x:0,y:0});assert.equal((await snapshot()).renderer.zoom,1);
    assert.equal(JSON.stringify((await snapshot()).state),original);await handle.dispose();
    await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'command-deck-desktop.png'),fullPage:true});
  });
  await check('display-preferences-and-optional-turn-review',async()=>{
    await page.getByRole('button',{name:'Sound and display settings',exact:true}).click();
    await page.locator('#label-setting').selectOption('all');await page.locator('#contrast-setting').selectOption('high');await page.locator('#review-turn').check();await close();
    assert.equal(await page.locator('.label-crowded').count(),0);assert.equal(await page.locator('html').getAttribute('data-contrast'),'high');
    await action('end').click();assert.equal((await snapshot()).state.turn,1);assert.equal(await page.locator('#dialog h2').innerText(),'Before the next turn');
    await page.getByRole('button',{name:'Keep planning',exact:true}).click();assert.equal((await snapshot()).state.turn,1);
    await action('end').click();await action('end-confirmed').click();await page.waitForFunction(()=>__voidward.state.turn===2);
    await page.reload();await page.waitForFunction(()=>__voidward?.state.turn===2);assert.equal(await page.locator('html').getAttribute('data-contrast'),'high');
    await page.getByRole('button',{name:'Sound and display settings',exact:true}).click();assert.equal(await page.locator('#review-turn').isChecked(),true);await page.locator('#review-turn').uncheck();await page.locator('#label-setting').selectOption('smart');await page.locator('#contrast-setting').selectOption('standard');await close();
  });
  await check('narrow-manifest-scroll-and-keyboard-guards',async()=>{
    await page.setViewportSize({width:390,height:844});await nav('Fleets').click();
    const before=JSON.stringify((await snapshot()).state);
    await page.locator('.table-scroll').evaluate(el=>{el.scrollLeft=180;});
    const offset=await page.locator('.table-scroll').evaluate(el=>el.scrollLeft);
    // Dispatch the real checkbox change without Playwright scrolling it back into
    // view first; browser layout/visibility is exercised separately below.
    await page.locator('[data-ship-select]').first().evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await page.locator('.table-scroll').evaluate(el=>el.scrollLeft),offset);
    await page.locator('#search-fleets').fill('Way');await page.locator('#search-fleets').press('e');
    assert.equal(JSON.stringify((await snapshot()).state),before);
    assert.equal(await page.locator('#search-fleets').evaluate(el=>el===document.activeElement),true);
    await page.locator('#search-fleets').fill('');await nav('Campaign workshop').click();
    const atlases=page.locator('.design-library');
    for(let i=0;i<await atlases.count();i++)await atlases.nth(i).evaluate((el,n)=>{el.scrollLeft=30+n*20;},i);
    const offsets=await atlases.evaluateAll(els=>els.map(el=>el.scrollLeft));
    await page.locator('#main').focus();await page.keyboard.press('8');
    assert.deepEqual(await page.locator('.design-library').evaluateAll(els=>els.map(el=>el.scrollLeft)),offsets);
    await nav('Galaxy map').click();
    for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'Open command menu',exact:true}).click();assert.equal(await page.locator('#command-search').isVisible(),true);await close();await page.screenshot({path:path.join(out,`command-deck-${width}.png`),fullPage:true});}
    await page.setViewportSize({width:1440,height:1000});
  });
  await check('fractional-dpr-repeat-reference-pixel-parity',async()=>{
    receipt.pixels=await page.evaluate(async()=>{
      const {drawMap}=await import('./js/render.js'),{createEngine}=await import('./js/core.js'),s=__voidward,engine=createEngine(s.pack),result=[];
      for(const [w,h] of [[601,421],[900,620]]){
        const a=document.createElement('canvas'),b=document.createElement('canvas');
        for(const c of [a,b]){c.style.width=w+'px';c.style.height=h+'px';document.body.append(c);}
        for(const [zoom,mode,pan] of [[1,'political',{x:0,y:0}],[1.8,'routes',{x:31,y:-22}],[.8,'survey',{x:-17,y:15}],[1,'political',{x:0,y:0}]])drawMap(a,s.state,engine,s.selected,s.selectedFleet,zoom,mode,{pan});
        drawMap(b,s.state,engine,s.selected,s.selectedFleet,1,'political',{cache:false});
        const x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
        if(x.length!==y.length||x.some((v,i)=>v!==y[i]))throw new Error('Repeated map redraw differs from fresh reference');
        result.push({w,h,dpr:devicePixelRatio,backing:[a.width,a.height],rgba:'identical'});a.remove();b.remove();
      }
      return result;
    });
  });
  await check('new-campaign-offline-save-and-briefing',async()=>{
    await action('new').click();await page.locator('#new-pack').selectOption('helix-accord');await page.waitForFunction(()=>!document.querySelector('[data-action="launch"]').disabled);await page.locator('#new-player').selectOption('1');await action('launch').click();
    await page.waitForFunction(()=>__voidward?.pack.meta.id==='helix-accord'&&__voidward.player===1&&!document.querySelector('#dialog').open);await action('end').click();
    const expected=JSON.stringify((await snapshot()).state);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller&&__voidward?.state.turn===2);
    await context.setOffline(true);await page.reload();await page.waitForFunction(()=>__voidward?.state.turn===2);assert.equal(JSON.stringify((await snapshot()).state),expected);
    await action('new').click();await page.locator('#new-pack').selectOption('glass-meridian');await page.waitForFunction(()=>!document.querySelector('[data-action="launch"]').disabled);assert.match(await page.locator('#new-briefing').innerText(),/Glass Meridian/);await close();assert.equal(JSON.stringify((await snapshot()).state),expected);
    await page.screenshot({path:path.join(out,'helix-offline.png'),fullPage:true});await context.setOffline(false);
  });
  await check('emulated-touch-pan-and-canvas-unavailable-gameplay',async()=>{
    const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),p=await touch.newPage();observe(p);
    try{
      await p.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;});
      await p.goto(url);await p.waitForFunction(()=>__voidward?.state&&document.querySelectorAll('.star-node').length);
      await p.locator('[data-action="pan-mode"]').tap();assert.equal(await p.locator('.chart-viewport').evaluate(el=>getComputedStyle(el).touchAction),'none');
      const box=await p.locator('.chart-viewport').boundingBox(),cdp=await touch.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+18,y:box.y+box.height-22}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+90,y:box.y+box.height-65}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      await p.waitForFunction(()=>__voidward.renderer.pan.x!==0);await p.locator('[data-action="zoom-reset"]').tap();await p.locator('[data-action="pan-mode"]').tap();
      await p.getByRole('button',{name:'Sol',exact:true}).tap();await p.getByRole('button',{name:'Colonise',exact:true}).tap();assert.equal((await p.evaluate(()=>__voidward)).state.planets[25].owner,0);
      await p.locator('[data-action="end"]').tap();await p.waitForFunction(()=>__voidward.state.turn===2);await p.screenshot({path:path.join(out,'canvas-unavailable-touch.png'),fullPage:true});
    }finally{await touch.close();}
  });
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.httpFailures,[]);assert.deepEqual(receipt.externalRequests,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failedCheck=current;receipt.error=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error(error);}
finally{await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));}
