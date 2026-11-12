// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parsePack, PACK_FILES } from '../js/content.js';
import { createEngine } from '../js/core.js';
import { campaigns } from '../mods/registry.js';
import { workerSource, inventory } from './site.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const manifest = JSON.parse(await fs.readFile('vendor/PROVENANCE.json', 'utf8'));
for (const file of manifest.files) {
  if (!/^[a-f0-9]{40}$/.test(file.commit)) throw new Error('Unpinned donor');
  const digest = createHash('sha256').update(await fs.readFile(file.local)).digest('hex');
  if (digest !== file.sha256) throw new Error(`Vendored source changed: ${file.local}`);
}
for (const campaign of campaigns) {
  const raw = Object.fromEntries(await Promise.all([...PACK_FILES, ...(campaign.files || [])].map(async name => [name + '.txt', await fs.readFile(new URL(name + '.txt', campaign.base), 'utf8')])));
  const pack = parsePack(raw); if (pack.meta.id !== campaign.id) throw new Error('Registry/pack identity mismatch');
  const engine = createEngine(pack, campaign.hooks); engine.validateState(engine.createGame());
}
const expectedWorker = await workerSource();
if (await fs.readFile('sw.js', 'utf8') !== expectedWorker) {
  const revision = expectedWorker.match(/const CACHE = PREFIX \\+ '([a-f0-9]+)'/)?.[1] || 'unknown';
  throw new Error(`Offline cache is stale (expected ${revision}). Run node scripts/site.mjs sync.`);
}
for (const file of await inventory()) {
  if (/\.(js|html|css)$/.test(file) && !file.startsWith('vendor/')) {
    const source = await fs.readFile(file, 'utf8');
    if (/\beval\s*\(|new\s+Function\s*\(/.test(source)) throw new Error(`Dynamic code evaluation forbidden: ${file}`);
  }
}
console.log(`PASS: ${manifest.files.length} pinned donor files; ${campaigns.length} valid campaigns; complete offline inventory.`);
