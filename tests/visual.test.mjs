// SPDX-License-Identifier: Apache-2.0
// Visual upgrade contracts: liveries are inert data, painters are deterministic
// functions of their inputs, chart overlays never reveal hidden information and
// undo only reinstates previously accepted states. Pixel parity stays a browser gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parsePack, PACK_FILES } from '../js/content.js';
import { createEngine } from '../js/core.js';
import { drawMap, drawMinimap, mapProjection, chartTransform, paintShip, paintPlanet, spectralClass, MAP_MODES } from '../js/render.js';
import { BUILTIN_LIVERIES, compileLiveryPack, exportLiveryPack, liveryCatalogue, liveryFor, autoLivery, LIVERY_PACK_KIND, LIVERY_PACK_BYTES, PATTERNS, TRIMS, FLAMES } from '../js/liveries.js';

const raw = Object.fromEntries(await Promise.all(PACK_FILES.map(async name => [name + '.txt', await fs.readFile(new URL(`../mods/frontier/${name}.txt`, import.meta.url), 'utf8')])));
const pack = parsePack(raw);

function recordingCanvas(width = 601, height = 421, dpr = 1) {
  const calls = [], target = {};
  const ctx = new Proxy(target, {
    get(object, key) { if (key in object) return object[key]; return (...args) => { calls.push([key, ...args]); if (key.startsWith('create') && key.endsWith('Gradient')) return { addColorStop(...stops) { calls.push(['colorStop', ...stops]); } }; }; },
    set(object, key, value) { object[key] = value; calls.push(['set', key, typeof value === 'object' ? 'gradient' : value]); return true; }
  });
  let pixelWidth = 300, pixelHeight = 150;
  const canvas = { clientWidth: width, clientHeight: height, ownerDocument: { defaultView: { devicePixelRatio: dpr } }, getContext() { return ctx; },
    get width() { return pixelWidth; }, set width(value) { pixelWidth = value; }, get height() { return pixelHeight; }, set height(value) { pixelHeight = value; } };
  return { canvas, calls };
}
const packJson = (liveries, extra = {}) => JSON.stringify({ kind: LIVERY_PACK_KIND, version: 1, id: 'test-hangar', title: 'Test hangar', author: 'Tester', liveries, ...extra });
const sample = { id: 'custom', name: 'Custom', description: 'A test finish.', hull: ['#112233', '#223344', '#334455', '#445566'], pattern: 'hex', trim: 'bands', flame: 'ion', glow: .5, wear: .2 };

test('livery packs are bounded inert data: template roundtrips, malformed content is rejected', () => {
  const template = compileLiveryPack(exportLiveryPack());
  assert.deepEqual(template.liveries.map(l => l.id), BUILTIN_LIVERIES.map(l => l.id));
  assert.ok(BUILTIN_LIVERIES.every(l => PATTERNS.includes(l.pattern) && TRIMS.includes(l.trim) && FLAMES.includes(l.flame)));
  const custom = compileLiveryPack(packJson([sample]));
  assert.equal(custom.liveries[0].hull[0], '#112233'); assert.ok(Object.isFrozen(custom.liveries[0]));
  const rejected = [
    [packJson([{ ...sample, extra: 1 }]), /unexpected/],
    [packJson([{ ...sample, hull: ['#112233'] }]), /bounded dense/],
    [packJson([{ ...sample, hull: ['#112233', '#223344', '#334455', 'url(javascript:1)'] }]), /hex colour/],
    [packJson([{ ...sample, pattern: 'script' }]), /unknown livery/],
    [packJson([{ ...sample, glow: 2 }]), /permitted range/],
    [packJson([sample, sample]), /duplicate/],
    [packJson([{ ...sample, id: 'Bad Id' }]), /invalid ID/],
    [packJson([]), /bounded dense/],
    [packJson([sample], { kind: 'qsol.drone-racer.skins.v1' }), /voidward.liveries.v1/],
    [JSON.stringify([sample]), /plain data record/],
    ['x'.repeat(LIVERY_PACK_BYTES + 1), /exceeds/]
  ];
  for (const [text, pattern] of rejected) assert.throws(() => compileLiveryPack(text), pattern);
  const merged = liveryCatalogue(compileLiveryPack(packJson([{ ...sample, id: 'standard', name: 'Replaced standard' }])));
  assert.equal(merged.length, BUILTIN_LIVERIES.length); assert.equal(merged[0].name, 'Replaced standard');
});

test('automatic liveries are stable per faction and explicit selections fall back safely', () => {
  for (const empire of pack.empires) {
    const auto = autoLivery(empire); assert.equal(autoLivery({ ...empire, id: 5 }).id, auto.id, 'empire slot does not change the automatic livery');
    assert.equal(liveryFor(empire, pack).id, auto.id);
  }
  const key = `${pack.meta.id}/0`;
  assert.equal(liveryFor(pack.empires[0], pack, { [key]: 'obsidian' }).id, 'obsidian');
  assert.equal(liveryFor(pack.empires[0], pack, { [key]: 'missing-livery' }).id, autoLivery(pack.empires[0]).id);
  assert.equal(liveryFor(pack.empires[0], pack, { [key]: 'custom' }, compileLiveryPack(packJson([sample]))).id, 'custom');
});

test('ship painter: every livery and role set is deterministic, applied, and keeps the hull fit', () => {
  const hull = { ...pack.hulls['scout-0'], shape: [[-60, -60], [60, -60], [60, 60], [-60, 60]] };
  const roles = ['engine', 'weapon', 'shield', 'survey', 'colony', 'assault'];
  const signatures = new Set();
  for (const livery of BUILTIN_LIVERIES) for (const large of [false, true]) {
    const a = recordingCanvas(), b = recordingCanvas();
    assert.equal(paintShip(a.canvas, hull, pack.empires[1], large, { livery, roles }), true);
    paintShip(b.canvas, hull, pack.empires[1], large, { livery, roles });
    assert.deepEqual(a.calls, b.calls, `${livery.id}: repeated paints must match exactly`);
    signatures.add(JSON.stringify(a.calls));
    const scale = a.calls.find(c => c[0] === 'scale')[1], angle = a.calls.find(c => c[0] === 'rotate')[1];
    for (const [x, y] of hull.shape) {
      const px = (x * Math.cos(angle) - y * Math.sin(angle)) * scale + a.canvas.width / 2, py = (x * Math.sin(angle) + y * Math.cos(angle)) * scale + a.canvas.height / 2;
      assert.ok(px > 0 && px < a.canvas.width && py > 0 && py < a.canvas.height, `${livery.id}: polygon clipped`);
    }
  }
  assert.equal(signatures.size, BUILTIN_LIVERIES.length * 2, 'each livery paints differently');
  const plain = recordingCanvas(), armed = recordingCanvas(), unarmed = recordingCanvas();
  paintShip(plain.canvas, pack.hulls['frigate-0'], pack.empires[0]);
  paintShip(unarmed.canvas, pack.hulls['frigate-0'], pack.empires[0], false, { roles: [] });
  paintShip(armed.canvas, pack.hulls['frigate-0'], pack.empires[0], false, { roles: ['weapon', 'shield'] });
  assert.deepEqual(plain.calls, unarmed.calls, 'omitted options paint the standard livery');
  assert.notDeepEqual(plain.calls, armed.calls, 'role decals are visible');
});

test('planet painter: eight variants, settlement lights only for owned worlds, identical repeats', () => {
  // The donor bakes its texture through a DOM canvas; a minimal stand-in lets Node exercise the painter's call sequence.
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
  try {
  for (const palette of ['ocean', 'gas', 'ice']) for (let variant = 0; variant < 8; variant++) {
    const a = recordingCanvas(), b = recordingCanvas();
    assert.equal(paintPlanet(a.canvas, palette, variant, { owner: '#72dbc4', pop: 40, max: 100 }), true);
    paintPlanet(b.canvas, palette, variant, { owner: '#72dbc4', pop: 40, max: 100 });
    assert.deepEqual(a.calls, b.calls);
  }
  const wild = recordingCanvas(), settled = recordingCanvas(), dense = recordingCanvas();
  paintPlanet(wild.canvas, 'ocean', 1); paintPlanet(settled.canvas, 'ocean', 1, { owner: '#72dbc4', pop: 10, max: 100 }); paintPlanet(dense.canvas, 'ocean', 1, { owner: '#72dbc4', pop: 100, max: 100 });
  assert.ok(settled.calls.length > wild.calls.length && dense.calls.length > settled.calls.length, 'lights scale with population');
  assert.throws(() => paintPlanet(wild.canvas, 'lava'), /Unknown planet palette/);
  } finally { globalThis.document = originalDocument; }
});

test('spectral classes depend only on seed and system id', () => {
  const classes = new Set();
  for (let id = 0; id < 64; id++) { const a = spectralClass(id, 2401); assert.deepEqual(a, spectralClass(id, 2401)); assert.match(a.name, /^[OBAFGKM]$/); assert.match(a.color, /^#[0-9a-f]{6}$/); classes.add(a.name); }
  assert.ok(classes.size >= 4, 'a 64-star sector shows several classes');
  assert.notDeepEqual(Array.from({ length: 30 }, (_, i) => spectralClass(i, 1).name), Array.from({ length: 30 }, (_, i) => spectralClass(i, 2).name));
});

test('every chart mode and the minimap draw identically before and after hidden empire changes', () => {
  const engine = createEngine(pack), state = engine.createGame(), enemyHome = pack.empires[1].home;
  engine.reveal(state, 0, enemyHome);
  const changed = structuredClone(state);
  changed.planets.find(p => p.system === enemyHome && p.owner === 1).owner = 2;
  changed.planets.find(p => p.system === enemyHome && p.owner === 2).pop = 90;
  changed.empires[1].tech.industry = 3; changed.empires[1].designs[2].hull = 'cruiser-1';
  changed.fleets.filter(f => f.owner === 1).forEach(f => { f.system = enemyHome; });
  engine.validateState(changed);
  assert.deepEqual(MAP_MODES, ['political', 'survey', 'routes', 'intel']);
  for (const mode of MAP_MODES) for (const detail of ['full', 'lean']) {
    const reference = recordingCanvas(), production = recordingCanvas(), before = JSON.stringify(state);
    drawMap(reference.canvas, state, engine, enemyHome, null, 1, mode, { detail });
    drawMap(production.canvas, changed, engine, enemyHome, null, 1, mode, { detail });
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(production.calls, reference.calls, `${mode}/${detail}: hidden changes must not alter the chart`);
  }
  const full = recordingCanvas(), lean = recordingCanvas();
  drawMap(full.canvas, state, engine, enemyHome, null, 1, 'political', { detail: 'full' }); drawMap(lean.canvas, state, engine, enemyHome, null, 1, 'political', { detail: 'lean' });
  assert.ok(lean.calls.length < full.calls.length, 'lean detail skips dust and grid work');
  const miniA = recordingCanvas(168, 112), miniB = recordingCanvas(168, 112), main = { w: 601, h: 421, zoom: 1.6, pan: { x: 40, y: -20 } };
  const points = drawMinimap(miniA.canvas, state, engine, main); drawMinimap(miniB.canvas, changed, engine, main);
  assert.deepEqual(miniA.calls, miniB.calls); assert.deepEqual(points, mapProjection(state.systems, 168, 112));
  const rect = miniA.calls.find(c => c[0] === 'strokeRect');
  assert.ok(rect && rect[3] > 0 && rect[4] > 0 && rect[3] < 168 && rect[4] < 112, 'viewport rectangle is drawn inside the overview');
});

test('chart transform matches the projection and inverts for minimap recentering', () => {
  const engine = createEngine(pack), state = engine.createGame();
  const t = chartTransform(state.systems, 601, 421, 1.4, { x: 25, y: -10 }), points = mapProjection(state.systems, 601, 421, 1.4, { x: 25, y: -10 });
  state.systems.forEach((s, i) => { assert.equal(points[i].x, 601 / 2 + (s.x - t.midX) * t.scale + t.dx); assert.equal(points[i].y, 421 / 2 + (s.y - t.midY) * t.scale + t.dy); });
  assert.equal(chartTransform([], 601, 421), null);
  // Centre a chart point: pan = −d·scale moves that point to the viewport centre.
  const target = state.systems[5], d = { x: target.x - t.midX, y: target.y - t.midY };
  const centred = mapProjection(state.systems, 601, 421, 1.4, { x: -d.x * t.scale, y: -d.y * t.scale })[5];
  assert.ok(Math.abs(centred.x - 300.5) < 1e-9 && Math.abs(centred.y - 210.5) < 1e-9);
});

test('E8 variations are seeded, bounded and stay in the pack score pitch classes', async () => {
  const originalDocument = globalThis.document, originalWindow = globalThis.window;
  globalThis.document = { hidden: true }; globalThis.window = {};
  try {
    const { e8Variation, Soundscape, E8_VARIATION_LENGTH } = await import('../js/audio.js');
    const classes = new Set(pack.music.map(n => n.note % 12)), low = Math.min(...pack.music.map(n => n.note)), high = Math.max(...pack.music.map(n => n.note));
    const a = e8Variation(pack.music, 2401), b = e8Variation(pack.music, 2401), c = e8Variation(pack.music, 2402);
    assert.equal(a.length, E8_VARIATION_LENGTH); assert.deepEqual(a, b); assert.notDeepEqual(a, c);
    for (const n of a) { assert.ok(Number.isInteger(n.note) && n.note >= 24 && n.note <= 96 && n.note >= low - 6 && n.note <= high + 11); assert.ok(classes.has(n.note % 12)); assert.ok(Number.isInteger(n.duration) && n.duration >= 1 && n.duration <= 8); }
    assert.deepEqual(e8Variation([], 1), []);
    const sound = new Soundscape(); sound.setScore(pack.music, { mode: 'e8', seed: 2401 });
    assert.equal(sound.mode, 'e8'); assert.deepEqual(sound.score, a); sound.setMode('pack'); assert.deepEqual(sound.score, pack.music); sound.setScore(pack.music, { mode: 'bogus' }); assert.equal(sound.mode, 'pack');
  } finally { globalThis.document = originalDocument; globalThis.window = originalWindow; }
});
