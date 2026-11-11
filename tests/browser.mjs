// SPDX-License-Identifier: Apache-2.0
// Integration QA against the staged Pages subpath. Playwright is tooling, not runtime.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '..'), stage = path.join(root, '_site'), out = path.join(root, 'test-results');
await fs.mkdir(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/4XGAMES/')) { res.writeHead(404); res.end(); return; }
    const relative = decodeURIComponent(url.pathname.slice('/4XGAMES/'.length)) || 'index.html', file = path.resolve(stage, relative);
    if (!file.startsWith(stage + path.sep)) throw new Error('Forbidden');
    const data = await fs.readFile(file); res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain'); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/4XGAMES/`;
let browser, page;
const errors = [], failed = [];
try {
  const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failed.push(r.url() + ' ' + r.status()); });
  page.on('request', r => { if (!r.url().startsWith(new URL(url).origin) && !r.url().startsWith('blob:')) errors.push('External request: ' + r.url()); });
  const snapshot = () => page.evaluate(() => globalThis.__voidward);
  const nav = name => page.locator('.nav').getByRole('button', { name, exact: true });
  await page.goto(url); await page.waitForFunction(() => globalThis.__voidward?.state && document.querySelectorAll('.star-node').length > 0);
  assert.equal((await snapshot()).state.turn, 1);
  await page.screenshot({ path: path.join(out, 'galaxy-desktop.png'), fullPage: true });
  // The actual controls, not a debug mutation, issue the first fleet orders.
  await page.getByRole('button', { name: /TAS Wayfarer/ }).click();
  await page.getByRole('button', { name: 'Kepler · unsurveyed', exact: true }).click();
  await page.getByRole('button', { name: 'Plot course →', exact: true }).click();
  await page.getByRole('button', { name: 'End turn', exact: false }).click();
  await page.waitForFunction(() => __voidward.state.turn === 2);
  assert.ok((await snapshot()).state.empires[0].known.includes(13));
  // Return to Sol, colonise the second planet, queue a lab, then cancel it.
  await page.getByRole('button', { name: 'Sol', exact: true }).click();
  await page.getByRole('button', { name: 'Colonise', exact: true }).click();
  assert.equal((await snapshot()).state.planets[25].owner, 0);
  await page.getByRole('button', { name: 'Manage colony', exact: true }).first().click();
  await page.locator('[data-action="build"][data-kind="lab"]').click();
  assert.equal((await snapshot()).state.planets[24].queue[0].kind, 'lab');
  await page.locator('[data-action="cancel-build"]').click();
  assert.equal((await snapshot()).state.planets[24].queue.length, 0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  // Research, designer and render all command views.
  await nav('Research').click();
  await page.locator('[data-action="research"][data-field="weapons"]').click();
  assert.equal((await snapshot()).state.empires[0].research, 'weapons');
  await nav('Ship designer').click();
  await page.locator('#design-name').fill('Chromium Test Frigate');
  await page.locator('#design-hull').selectOption('frigate-0');
  await page.getByRole('button', { name: 'Add Lance array 1', exact: true }).click();
  await page.getByRole('button', { name: 'Register ship class' }).click();
  assert.equal((await snapshot()).state.empires[0].designs.at(-1).name, 'Chromium Test Frigate');
  await page.screenshot({ path: path.join(out, 'ship-designer.png'), fullPage: true });
  for (const name of ['Colonies', 'Fleets', 'Diplomacy', 'Turn reports', 'Campaign workshop']) { await nav(name).click(); assert.ok((await page.locator('main').innerText()).length > 100); }
  await page.screenshot({ path: path.join(out, 'campaign-workshop.png'), fullPage: true });
  // Real Web Audio graph, with a user gesture; source rendering must remain cosmetic.
  const beforeSound = JSON.stringify((await snapshot()).state);
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await page.waitForFunction(() => __voidward.audio.enabled && __voidward.audio.context === 'running' && __voidward.audio.cachedNotes > 0);
  assert.equal(JSON.stringify((await snapshot()).state), beforeSound);
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  // Saves are self-contained. Invalid imports cannot clobber the running campaign.
  await page.getByRole('button', { name: 'Save / load', exact: true }).click();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export save', exact: true }).click();
  const download = await downloadPromise, saved = await fs.readFile(await download.path(), 'utf8');
  const before = JSON.stringify((await snapshot()).state);
  await page.locator('#save-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"wrong"}') });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Choose a VOIDWARD'));
  assert.equal(JSON.stringify((await snapshot()).state), before);
  await page.locator('#save-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('restored'));
  assert.equal(JSON.stringify((await snapshot()).state), before);
  await page.reload(); await page.waitForFunction(() => __voidward?.state.turn === 2); assert.equal(JSON.stringify((await snapshot()).state), before);
  // Exact OPT cache parity and scoped observation, not a universal speed claim.
  const performance = await page.evaluate(async () => {
    const { paintPlanet } = await import('./js/render.js'); const { bakePlanet } = await import('./vendor/offline-games/shared/surface-detail.js');
    const results = [];
    for (const palette of ['ocean', 'gas', 'ice']) {
      const a = document.createElement('canvas'); paintPlanet(a, palette); const b = bakePlanet(palette);
      const x = a.getContext('2d').getImageData(0, 0, 256, 256).data, y = b.getContext('2d').getImageData(0, 0, 256, 256).data;
      if (x.some((v, i) => v !== y[i])) throw new Error('Planet cache pixel mismatch');
    }
    for (let repeat = 0; repeat < 5; repeat++) {
      const a = document.createElement('canvas'); let start = window.performance.now(); for (let i = 0; i < 12; i++) bakePlanet('ocean'); const baseline = window.performance.now() - start;
      start = window.performance.now(); for (let i = 0; i < 12; i++) paintPlanet(a, 'ocean'); results.push({ baselineMs: baseline, reusedMs: window.performance.now() - start });
    }
    return { userAgent: navigator.userAgent, drawsPerTrial: 12, parity: 'all RGBA bytes / all 3 palettes', trials: results };
  });
  await fs.writeFile(path.join(out, 'texture-reuse.json'), JSON.stringify(performance, null, 2));
  // Directory pack import changes real names, hull data, rules and victory.
  const modDir = path.join(out, 'text-campaign'); await fs.mkdir(modDir, { recursive: true });
  for (const name of await fs.readdir(path.join(stage, 'mods/frontier'))) {
    if (!name.endsWith('.txt')) continue; let text = await fs.readFile(path.join(stage, 'mods/frontier', name), 'utf8');
    if (name === 'campaign.txt') text = text.replace('id = frontier', 'id = browser-mod').replace('The Open Frontier', 'Browser Mod Campaign');
    if (name === 'empire_names.txt') text = text.replace('Terran Assembly', 'The Free Worlds');
    if (name === 'planet_names.txt') text = text.replace('Sol Prime', 'Liberty');
    if (name === 'ships.txt') text = text.replace('TAS Wayfarer', 'Modded Surveyor');
    if (name === 'rules.txt') text = text.replace('colonyTarget = 14', 'colonyTarget = 2');
    await fs.writeFile(path.join(modDir, name), text);
  }
  await page.locator('#mod-files').setInputFiles(modDir); await page.waitForFunction(() => __voidward?.pack.meta.id === 'browser-mod');
  assert.equal((await snapshot()).state.planets[24].name, 'Liberty'); assert.equal((await snapshot()).state.fleets[0].name, 'Modded Surveyor');
  await page.getByRole('button', { name: 'Colonise', exact: true }).click(); assert.equal((await snapshot()).state.winner, 0);
  assert.match(await page.locator('main').innerText(), /Free Worlds.*prevails/);
  // Real source campaign selection and isolation, then responsive and offline smoke.
  await nav('Campaign workshop').click();
  await page.locator('[data-action="campaign-prompt"][data-pack="machine-dawn"]').click();
  assert.equal(await page.locator('#new-pack').inputValue(), 'machine-dawn'); await page.getByRole('button', { name: 'Launch expedition' }).click();
  await page.waitForFunction(() => __voidward?.pack.meta.id === 'machine-dawn');
  assert.equal((await snapshot()).state.systems.length, 16); assert.match((await snapshot()).state.log[0].text, /Network reboot/);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Galaxy map', 'Colonies', 'Research', 'Ship designer', 'Campaign workshop']) {
      await nav(name).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px / ${name}`);
    }
    await nav('Galaxy map').click();
    await page.screenshot({ path: path.join(out, `galaxy-${width}.png`), fullPage: true });
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await context.setOffline(true); await page.reload(); await page.waitForFunction(() => __voidward?.pack.meta.id === 'machine-dawn');
  await page.getByRole('button', { name: 'End turn', exact: false }).click(); assert.equal((await snapshot()).state.turn, 2);
  await context.setOffline(false);
  // Emulated touch is a distinct input context, without the previous campaign's storage.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await touch.newPage(); phone.on('pageerror', e => errors.push(e.message)); await phone.goto(url); await phone.waitForFunction(() => __voidward?.state);
  await phone.getByRole('button', { name: /TAS Wayfarer/ }).tap(); await phone.getByRole('button', { name: 'Kepler · unsurveyed', exact: true }).tap(); await phone.getByRole('button', { name: 'Plot course →', exact: true }).tap(); await phone.getByRole('button', { name: 'End turn', exact: false }).tap(); assert.equal(await phone.evaluate(() => __voidward.state.turn), 2);
  await touch.close(); assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  await fs.writeFile(path.join(out, 'browser-result.json'), JSON.stringify({ result: 'PASS', browser: browser.version(), desktop: '1440x1000', responsive: [390, 320], touch: 'emulated', externalRequests: 0, pageErrors: errors, httpFailures: failed, checks: ['movement', 'colonisation', 'construction/cancel', 'research', 'ship-design', 'all-views', 'web-audio', 'save-roundtrip', 'rejected-save', 'reload', 'texture-parity', 'directory-mod', 'mod-victory', 'source-campaign', 'responsive', 'offline', 'touch'] }, null, 2));
  console.log('PASS: packaged Chromium, gameplay, ship designer, text mods, save isolation, audio, responsive layouts, touch, offline and exact texture parity.');
} catch (error) {
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(out, 'browser-failure.json'), JSON.stringify({ error: error.stack, pageErrors: errors, httpFailures: failed, url: page?.url() }, null, 2));
  throw error;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
