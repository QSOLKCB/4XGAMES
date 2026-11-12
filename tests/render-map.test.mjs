// SPDX-License-Identifier: Apache-2.0
// Geometry, Canvas lifecycle and information-boundary tests. Browser RGBA parity
// remains a separate gate; the recorder here does not claim to rasterize pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parsePack, PACK_FILES } from '../js/content.js';
import { createEngine } from '../js/core.js';
import { drawMap, mapProjection, paintShip, paintPlanet, backdropStats } from '../js/render.js';

const raw = Object.fromEntries(await Promise.all(PACK_FILES.map(async name => [name + '.txt', await fs.readFile(new URL(`../mods/frontier/${name}.txt`, import.meta.url), 'utf8')])));
const pack = parsePack(raw);

function recordingCanvas(width = 601, height = 421, dpr = 1.25) {
  const calls = [], dimensions = [], target = {};
  const ctx = new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      return (...args) => {
        calls.push([key, ...args]);
        if (key.startsWith('create') && key.endsWith('Gradient')) return { addColorStop(...stops) { calls.push(['colorStop', ...stops]); } };
      };
    },
    set(object, key, value) { object[key] = value; calls.push(['set', key, typeof value === 'object' ? 'gradient' : value]); return true; }
  });
  let pixelWidth = 300, pixelHeight = 150;
  const canvas = {
    clientWidth: width, clientHeight: height,
    ownerDocument: { defaultView: { devicePixelRatio: dpr } },
    getContext() { return ctx; },
    get width() { return pixelWidth; }, set width(value) { dimensions.push(['width', value]); pixelWidth = value; },
    get height() { return pixelHeight; }, set height(value) { dimensions.push(['height', value]); pixelHeight = value; }
  };
  return { canvas, calls, dimensions };
}

test('map projection keeps hit targets in CSS space while zoom and bounded pan remain cosmetic', () => {
  const engine = createEngine(pack), state = engine.createGame(), before = JSON.stringify(state);
  const fit = mapProjection(state.systems, 601, 421), pan = mapProjection(state.systems, 601, 421, 1, { x: 63.5, y: -24 });
  for (let i = 0; i < fit.length; i++) {
    assert.ok(fit[i].x >= 44 && fit[i].x <= 557 && fit[i].y >= 50 && fit[i].y <= 371);
    assert.equal(pan[i].x, fit[i].x + 63.5); assert.equal(pan[i].y, fit[i].y - 24);
  }
  const tiny = mapProjection([{ x: -50, y: -50 }, { x: 50, y: 50 }], 20, 20);
  assert.ok(tiny[1].x > tiny[0].x && tiny[1].y > tiny[0].y, 'small panels must not mirror the chart');
  assert.deepEqual(mapProjection(state.systems, 0, 400), []);
  assert.deepEqual(mapProjection(state.systems, 601, 421, NaN, { x: Infinity }), fit);
  assert.ok(mapProjection(state.systems, 601, 421, 1, { x: 1e300 })[0].x < 3000, 'pointer overflow stays bounded');
  assert.equal(JSON.stringify(state), before);
});

test('selection redraw retains canvas backing pixels and recomputes scale after CSS or DPR changes', () => {
  const engine = createEngine(pack), state = engine.createGame(), { canvas, calls, dimensions } = recordingCanvas();
  const original = drawMap(canvas, state, engine, 12, null);
  assert.deepEqual(dimensions, [['width', 751], ['height', 526]]);
  assert.deepEqual(calls.find(c => c[0] === 'setTransform'), ['setTransform', 751 / 601, 0, 0, 526 / 421, 0, 0]);
  calls.length = 0; dimensions.length = 0;
  assert.deepEqual(drawMap(canvas, state, engine, 13, null), original);
  assert.deepEqual(dimensions, [], 'same-size redraw must not destroy the backing store');
  canvas.ownerDocument.defaultView.devicePixelRatio = 2;
  assert.deepEqual(drawMap(canvas, state, engine, 13, null), original, 'DPR changes must not move DOM targets');
  assert.deepEqual(dimensions, [['width', 1202], ['height', 842]]);
  canvas.clientWidth = 390; dimensions.length = 0;
  const mobile = drawMap(canvas, state, engine, 13, null);
  assert.equal(mobile.length, state.systems.length); assert.ok(mobile.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.deepEqual(dimensions, [['width', 780]]);
});

test('unavailable Canvas2D retains selectable map geometry and safely skips cosmetic thumbnails', () => {
  const engine = createEngine(pack), state = engine.createGame(), canvas = recordingCanvas().canvas;
  canvas.getContext = () => null;
  assert.deepEqual(drawMap(canvas, state, engine, 12, null, 1, 'political', { pan: { x: 15, y: 6 } }), mapProjection(state.systems, 601, 421, 1, { x: 15, y: 6 }));
  assert.equal(paintShip(canvas, pack.hulls['scout-0'], pack.empires[0]), false);
  assert.equal(paintPlanet(canvas), false);
});

test('map decoration preserves state and does not reveal changes beyond last-seen intelligence', () => {
  const engine = createEngine(pack), state = engine.createGame(), enemyHome = pack.empires[1].home;
  engine.reveal(state, 0, enemyHome);
  const reference = recordingCanvas(), production = recordingCanvas(), before = JSON.stringify(state);
  drawMap(reference.canvas, state, engine, enemyHome, null, 1, 'political');
  assert.equal(JSON.stringify(state), before);
  const changed = structuredClone(state);
  changed.planets.find(p => p.system === enemyHome && p.owner === 1).owner = 2;
  changed.empires[1].tech.industry = 3; changed.empires[1].designs[2].hull = 'cruiser-1';
  engine.validateState(changed);
  drawMap(production.canvas, changed, engine, enemyHome, null, 1, 'political');
  assert.deepEqual(production.calls, reference.calls, 'hidden empire changes must not recolour last-seen territory or routes');
  assert.deepEqual(backdropStats(), { entries: 0, bytes: 0, mode: 'reference' }, 'no retained raster backdrop is admitted');
});

test('rotation fits every admitted hull point within its small and large preview', () => {
  const hull = { ...pack.hulls['scout-0'], shape: [[-60, -60], [60, -60], [60, 60], [-60, 60]] };
  for (const large of [false, true]) {
    const { canvas, calls } = recordingCanvas();
    paintShip(canvas, hull, pack.empires[0], large);
    const scale = calls.find(c => c[0] === 'scale')[1], angle = calls.find(c => c[0] === 'rotate')[1];
    for (const [x, y] of hull.shape) {
      const px = (x * Math.cos(angle) - y * Math.sin(angle)) * scale + canvas.width / 2;
      const py = (x * Math.sin(angle) + y * Math.cos(angle)) * scale + canvas.height / 2;
      assert.ok(px > 0 && px < canvas.width && py > 0 && py < canvas.height, `${large ? 'large' : 'small'} polygon clipped`);
    }
  }
});
