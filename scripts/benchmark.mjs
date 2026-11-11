// SPDX-License-Identifier: Apache-2.0
// Fixed, bounded engine workload; never starts a browser or controls input.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
const root = path.resolve(process.argv[2] || new URL('../', import.meta.url).pathname);
const output = path.resolve(process.argv[3] || 'test-results/engine-benchmark.json');
const seedCount = Number(process.argv[4] || 8);
if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 32) throw Error('Use 1..32 seeds.');
const { parsePack, PACK_FILES } = await import(pathToFileURL(path.join(root, 'js/content.js')));
const { createEngine } = await import(pathToFileURL(path.join(root, 'js/core.js')));
const { campaigns } = await import(pathToFileURL(path.join(root, 'mods/registry.js')));
const sourceSha256 = Object.fromEntries(await Promise.all(['js/core.js', 'js/content.js', 'mods/registry.js'].map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex')])));
const load = async c => Object.fromEntries(await Promise.all([...PACK_FILES, ...(c.files || [])].map(async n => [n + '.txt', await fs.readFile(new URL(n + '.txt', c.base), 'utf8')])));
const stats = values => { const s = values.toSorted((a, b) => a - b); return { count: s.length, median: s[Math.floor(s.length / 2)] || 0, p95: s[Math.min(s.length - 1, Math.floor(s.length * .95))] || 0, max: s.at(-1) || 0 }; };
const hash = value => createHash('sha256').update(value).digest('hex');
const stress = JSON.parse(await fs.readFile(new URL('../docs/evidence/expansion/stress-pack.json', import.meta.url), 'utf8'));
const results = [];
for (const c of [...campaigns, { id: 'stress-64x4', raw: stress, hooks: {}, maxTurn: 120 }]) {
  const pack = parsePack(c.raw || await load(c)), e = createEngine(pack, c.hooks), runs = [];
  for (let seed = 0; seed < seedCount; seed++) {
    const s = e.createGame(seed), replay = e.createGame(seed), turnMs = [], transactionMs = [], saveBytes = [];
    const maxTurn = Math.min(pack.rules.turnLimit, c.maxTurn || 160);
    while (s.winner === null && s.turn < maxTurn) {
      let start = performance.now(); e.endTurn(s); turnMs.push(performance.now() - start);
      start = performance.now(); const clone = structuredClone(s); e.validateState(clone); const text = e.serialize(clone); transactionMs.push(performance.now() - start); saveBytes.push(Buffer.byteLength(text));
    }
    while (replay.winner === null && replay.turn < maxTurn) e.endTurn(replay);
    const digest = hash(e.serialize(s));
    if (digest !== hash(e.serialize(replay))) throw Error(`${c.id}/${seed}: replay mismatch`);
    runs.push({ seed, turn: s.turn, winner: s.winner, victory: s.victory, ships: s.fleets.length, colonies: s.empires.map(x => e.colonies(s, x.id).length), replaySha256: digest, turnMs, cloneValidateSerializeMs: transactionMs, saveBytes: stats(saveBytes), heapUsed: process.memoryUsage().heapUsed });
  }
  const summary = { turnMs: stats(runs.flatMap(r => r.turnMs)), cloneValidateSerializeMs: stats(runs.flatMap(r => r.cloneValidateSerializeMs)), terminalTurn: stats(runs.map(r => r.turn)) };
  results.push({ id: c.id, contentSha256: hash(JSON.stringify(pack.raw)), systems: pack.map.length, planets: pack.map.length * pack.rules.planetsPerSystem, runs, summary });
  console.log(c.id, JSON.stringify(summary));
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ sourceSha256, environment: { node: process.version, cpu: os.cpus()[0].model, platform: process.platform, arch: process.arch }, method: 'Fixed seeds starting at zero, standard difficulty, idle player, installed hooks, at most 160 turns (120 for the preserved 64-star/256-planet stress fixture). Separate endTurn and clone+validate+serialize timings. Independent replay hash parity for every run. Process heap snapshot is approximate and includes harness/GC effects. No rendering/audio/input timing. No cross-version replay equality is claimed.', seedCount, results }, null, 2) + '\n');
