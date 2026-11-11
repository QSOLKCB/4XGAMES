// SPDX-License-Identifier: Apache-2.0
// This wrapper intentionally refuses to launch any process before the owner gate.
// Set the variable only AFTER stopping work and receiving literal user "proceed".
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
if(process.env.VOIDWARD_OWNER_PROCEED!=='1')throw new Error('STOP: owner browser test is gated. Stop implementation, explain the 20–30 minute workload, and wait for literal proceed. Then set VOIDWARD_OWNER_PROCEED=1.');
const root=path.resolve(import.meta.dirname,'..'),stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const out=path.resolve(process.env.VOIDWARD_OWNER_OUT||path.join(root,'test-results','owner-'+stamp));
const baseline=path.resolve(process.env.VOIDWARD_BASELINE_ROOT||'/tmp/voidward-baseline-browser');
const baselineStage=path.resolve(process.env.VOIDWARD_BASELINE_STAGE||'/tmp/_site-voidward-untouched-b8de586');
const stage=path.resolve(process.env.VOIDWARD_STAGE||path.join(root,'_site'));
await fs.mkdir(out,{recursive:true});
const log={started:new Date().toISOString(),status:'RUNNING',ownerGate:'VOIDWARD_OWNER_PROCEED=1; operator must retain conversation approval',browserMode:'headed dedicated temporary Chromium profiles; Playwright protocol only',workload:'untouched baseline suite, proposed legacy suite, expanded campaign/player/creator suite',manualRequirements:['Inspect screenshots and play a representative section after automation.','Listen to generated sound if output is available.','Classify actual GPU path from diagnostics; hardware presence is insufficient.'],runs:[]};
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'voidward-owner-harness-'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function identity(checkout){try{return{checkout,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim(),trackedDiffSha256:digest(execFileSync('git',['diff','--binary','HEAD'],{cwd:checkout,maxBuffer:32*1024*1024}))};}catch(error){return{checkout,error:error.message};}}
async function inventory(directory){const files=[];async function visit(dir){for(const e of(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=path.join(dir,e.name);if(e.isDirectory())await visit(name);else if(e.isFile())files.push({path:path.relative(directory,name),sha256:digest(await fs.readFile(name))});}}await visit(directory);return{directory,sha256:digest(JSON.stringify(files)),files};}
log.proposed=await identity(root);log.baseline=await identity(baseline);
let activeChild,stopRequested=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopRequested=true;log.stopSignal=signal;activeChild?.kill('SIGTERM');});
async function run(name,script,env={}){
  if(stopRequested)throw new Error('Owner browser workload stopped.');
  const target=path.join(out,name);await fs.mkdir(target,{recursive:true});
  const record={name,script,started:new Date().toISOString(),status:'RUNNING'};log.runs.push(record);await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(log,null,2));
  const stdout=await fs.open(path.join(target,'stdout.log'),'w'),stderr=await fs.open(path.join(target,'stderr.log'),'w');
  try{record.exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{cwd:root,env:{...process.env,VOIDWARD_BROWSER_MODE:'owner',VOIDWARD_BROWSER_OUT:target,...env},stdio:['ignore',stdout.fd,stderr.fd]});activeChild=child;const timer=setTimeout(()=>{record.timeout=true;child.kill('SIGTERM');},15*60*1000);child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',(code,signal)=>{clearTimeout(timer);activeChild=null;record.signal=signal;resolve(code);});});record.status=record.exitCode===0?'PASS':'FAIL';}
  catch(error){record.status='FAIL';record.error=error.message;throw error;}
  finally{await stdout.close();await stderr.close();record.finished=new Date().toISOString();await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(log,null,2));}
  if(record.status!=='PASS')throw new Error(name+' failed; preserved evidence at '+target);
}
async function legacyHarness(checkout,packaged,name){
  const source=await fs.readFile(path.join(checkout,'tests/browser.mjs'),'utf8');
  // Only the harness plumbing is changed. Game bytes remain those of the staged
  // checkout; source/output hashes make this adaptation visible and reviewable.
  const constant="const root = path.resolve(import.meta.dirname, '..'), stage = path.join(root, '_site'), out = path.join(root, 'test-results');";
  if(!source.includes(constant)||!source.includes('headless: true'))throw new Error('Legacy harness changed; inspect before adapting paths/headed mode.');
  const generated=source.replace('let browser, page;',`let browser, page; process.once('SIGTERM',()=>{Promise.resolve(browser?.close()).finally(()=>{server.close();process.exit(143);});});`).replace(constant,`const root = ${JSON.stringify(checkout)}, stage = ${JSON.stringify(packaged)}, out = ${JSON.stringify(path.join(out,name))};`).replace('headless: true','headless: false');
  const file=path.join(scratch,name+'.mjs');await fs.writeFile(file,generated);
  log.runs.push({name:name+'-harness-preparation',status:'PREPARED',source:path.join(checkout,'tests/browser.mjs'),sourceSha256:digest(source),adaptedSha256:digest(generated),changes:['absolute checkout/stage/output paths','headed browser; Chromium generates a separate temporary profile']});return file;
}
try{
  // Require the user/tooling to build proposed _site beforehand; no implementation
  // work or package installation occurs in the guarded browser window.
  await fs.access(path.join(stage,'index.html'));await fs.access(path.join(baselineStage,'index.html'));log.proposedPackage=await inventory(stage);log.baselinePackage=await inventory(baselineStage);
  await run('baseline',await legacyHarness(baseline,baselineStage,'baseline'));
  await run('legacy-proposed',await legacyHarness(root,stage,'legacy-proposed'));
  await run('expansion',path.join(root,'tests/expansion-browser.mjs'),{VOIDWARD_STAGE:stage});
  log.status='AUTOMATION_PASS_MANUAL_INSPECTION_PENDING';
}catch(error){log.status='FAIL';log.error=error.stack;process.exitCode=1;}
finally{log.finished=new Date().toISOString();await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(log,null,2));await fs.rm(scratch,{recursive:true,force:true});console.log(`Browser automation finished. Inspect ${out}. Verify owned browser processes closed before handing the machine back.`);}
