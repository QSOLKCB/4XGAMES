// SPDX-License-Identifier: Apache-2.0
import '../vendor/galaxy/data/uff-demo.js';
import '../vendor/galaxy/uff-physics.js';
import '../vendor/galaxy/galaxy-core.js';
import '../vendor/gluball/gluball-core.js';
import { bakePlanet } from '../vendor/offline-games/shared/surface-detail.js';

// OPT-INV-001: identical palette + fixed light + donor implementation => identical pixels.
// Only three finite palette keys; generated canvases never escape for mutation.
const planetTextures = new Map();
export function paintPlanet(canvas, palette = 'ocean', variant = 0) {
  if (!['ocean', 'gas', 'ice'].includes(palette)) throw new Error('Unknown planet palette.');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  if (!planetTextures.has(palette)) planetTextures.set(palette, bakePlanet(palette));
  canvas.width = canvas.height = 256;
  ctx.clearRect(0, 0, 256, 256);
  if (variant && palette === 'gas') {
    ctx.save(); ctx.translate(128,128);ctx.rotate(-.35);ctx.strokeStyle='#d4ae7360';ctx.lineWidth=12;ctx.beginPath();ctx.ellipse(0,0,123,42,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    ctx.drawImage(planetTextures.get(palette),32,32,192,192);
  } else ctx.drawImage(planetTextures.get(palette),0,0);
  if (variant && palette !== 'gas') {
    ctx.save();ctx.globalCompositeOperation='source-atop';const g=ctx.createRadialGradient(128,128,95,128,128,127);g.addColorStop(0,'transparent');g.addColorStop(1,variant%2?'#79cee44a':'#e6b77b38');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);ctx.restore();
  }
  return true;
}
export function paintShip(canvas, hull, empire, large = false) {
  const ctx = canvas.getContext('2d'), w = large ? 600 : 180, h = large ? 500 : 180;
  if (!ctx) return false;
  canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);
  // Imported polygons may reach every corner of the admitted −60…60 square.
  // Fit their circumradius so the preview never clips a valid hull when rotated.
  const radius = Math.max(1, ...hull.shape.map(([x, y]) => Math.hypot(x, y)));
  const scale = Math.min(large ? 3.1 : 1.32, (Math.min(w, h) / 2 - (large ? 28 : 16)) / radius);
  const family = [...empire.short].reduce((sum, ch) => sum + ch.codePointAt(0), 0) % 3;
  ctx.save(); ctx.translate(w / 2, h / 2);
  ctx.rotate(large ? -.38 : -.35); ctx.scale(scale, scale);
  const shape = () => { ctx.beginPath(); hull.shape.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
  // Engine bloom and paneling are cosmetic; the editable polygon owns the silhouette.
  const flame = ctx.createLinearGradient(0, 30, 0, 70); flame.addColorStop(0, empire.color); flame.addColorStop(1, 'transparent');
  ctx.fillStyle = flame;
  for (const x of family === 0 ? [-13, 7] : family === 1 ? [-4] : [-19, -4, 11]) ctx.fillRect(x, 33, 8, 34);
  shape(); ctx.shadowColor = empire.color; ctx.shadowBlur = 9; ctx.fillStyle = empire.color + '66'; ctx.fill(); ctx.shadowBlur = 0;
  const metal = ctx.createLinearGradient(-45, -45, 45, 40); metal.addColorStop(0, '#93aab8'); metal.addColorStop(.43, '#4a6576'); metal.addColorStop(.48, '#253f50'); metal.addColorStop(1, '#091723');
  shape(); ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = empire.color; ctx.lineWidth = .65; ctx.stroke();
  ctx.save(); shape(); ctx.clip();
  ctx.strokeStyle = '#0c1c2a'; ctx.lineWidth = 2;
  for (let y = -40; y < 50; y += 13) {
    ctx.beginPath(); ctx.moveTo(-50, y);
    if (family === 1) ctx.quadraticCurveTo(0, y + 20, 50, y);
    else ctx.lineTo(50, y + (family === 0 ? 11 : 0));
    ctx.stroke();
  }
  ctx.fillStyle = empire.color; ctx.globalAlpha = .65; ctx.fillRect(-4, -38, 3, 68); ctx.globalAlpha = 1;
  ctx.fillStyle = '#07131b'; ctx.fillRect(-6, -17, 12, 18); ctx.strokeStyle = empire.accent; ctx.lineWidth = .6; ctx.strokeRect(-6, -17, 12, 18);
  ctx.fillStyle = empire.accent; ctx.fillRect(-3, -14, 6, 6);
  ctx.fillStyle = '#a7bac5'; ctx.fillRect(-21, 9, 4, 13); ctx.fillRect(17, 9, 4, 13);
  ctx.fillStyle = '#132332'; ctx.fillRect(-24, 26, 11, 8); ctx.fillRect(13, 26, 11, 8);
  ctx.fillStyle = empire.accent; ctx.globalAlpha = .8;
  for (let i = 0; i < 3; i++) { ctx.fillRect(-18, 3 + i * 5, 3, 1.4); ctx.fillRect(15, 3 + i * 5, 3, 1.4); }
  ctx.restore(); ctx.restore();
  if (large) {
    ctx.strokeStyle = '#486276'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(50, h / 2); ctx.lineTo(w - 50, h / 2); ctx.moveTo(w / 2, 25); ctx.lineTo(w / 2, h - 25); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '11px monospace'; ctx.fillStyle = '#7292a5'; ctx.fillText('HULL / ' + hull.slots + ' SLOTS', 25, 30); ctx.fillText('TOP PROJECTION', w - 140, h - 25);
    ctx.fillStyle = empire.color; ctx.fillText(empire.short + ' / ' + hull.id.toUpperCase(), 25, h - 25);
  }
  return true;
}
export function paintRelic(ctx, x, y, size, color = '#d4ae73') {
  const points = 90, G = globalThis.GluballCore;
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const p = G.centerline(i / points * Math.PI * 2);
    const u = (p.x + p.z * .35) * size / 3, v = (p.y * .55 - p.z * .55) * size / 3;
    i ? ctx.lineTo(u, v) : ctx.moveTo(u, v);
  }
  ctx.stroke(); ctx.restore();
}
const galaxyData = new Map();
function starField(seed) {
  if (!galaxyData.has(seed)) {
    if (galaxyData.size >= 2) galaxyData.delete(galaxyData.keys().next().value);
    const G = globalThis.GalaxyCore, data = G.buildSample(2 ** 20, 1024, seed);
    const settings = G.normalizeSettings({ ...G.PRESETS.grand, dynamics: 'legacy', seed, inclination: 30, scatter: .8 });
    galaxyData.set(seed, Array.from({ length: 1024 }, (_, i) => G.starAt(data, i, settings, 0, {})));
  }
  return galaxyData.get(seed);
}
// OPT-INV-001 stopping condition: the raster backdrop cache failed exact RGBA
// parity on the owner's hardware-accelerated Chromium. Keep direct rendering;
// neither the GPU path nor correctness is traded away for a cosmetic cache.
// Retain diagnostics and the cache:false reference option for test compatibility.
export function backdropStats() { return { entries: 0, bytes: 0, mode: 'reference' }; }
export function clearBackdropCache() {}
export function drawBackdropReference(ctx, w, h, seed) {
  ctx.fillStyle = '#080f19'; ctx.fillRect(0, 0, w, h);
  for (const [x, y, radius, color] of [[w * .6, h * .4, w * .7, '#172737'], [w * .25, h * .8, w * .38, '#183b3b'], [w * .8, h * .1, w * .4, '#251d35']]) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  }
  // Fixed, low-contrast dust filaments. They use no animation clock or gameplay
  // RNG, and are redrawn directly on the same Canvas2D path as the reference.
  const drift = (seed % 97) / 97;
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.translate(w * (.2 + i * .27), h * (.25 + i * .24)); ctx.rotate(-.25 + drift * .15); ctx.scale(1, .16 + i * .035);
    const dust = ctx.createRadialGradient(0, 0, 0, 0, 0, w * .65);
    dust.addColorStop(0, i % 2 ? '#74649816' : '#578b9a18'); dust.addColorStop(.45, '#365c7710'); dust.addColorStop(1, 'transparent');
    ctx.fillStyle = dust; ctx.fillRect(-w, -w, w * 2, w * 2); ctx.restore();
  }
  for (const p of starField(seed)) {
    ctx.globalAlpha = p.light * .23; ctx.fillStyle = p.tint < .5 ? '#b8d7ed' : '#e5c8a9';
    const x = w / 2 + p.x * w * .64, y = h / 2 + p.y * h * .72; ctx.fillRect(x, y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#5e839313'; ctx.lineWidth = .5;
  for (let x = 30; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 30; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.font = '9px monospace'; ctx.fillStyle = '#7893a345';
  for (let x = 90; x < w - 50; x += 180) ctx.fillText(String(Math.round(x)).padStart(3, '0'), x + 4, 15);
  for (let y = 90; y < h - 50; y += 180) ctx.fillText(String(Math.round(y)).padStart(3, '0'), 7, y - 5);
}

// All values are CSS pixels: DOM star targets and canvas geometry share this
// projection even if the context is unavailable or backing pixels use a new DPR.
export function mapProjection(systems, w, h, zoom = 1, pan = {}) {
  if (!systems.length || !(w > 0 && h > 0)) return [];
  const minX = Math.min(...systems.map(s => s.x)), maxX = Math.max(...systems.map(s => s.x));
  const minY = Math.min(...systems.map(s => s.y)), maxY = Math.max(...systems.map(s => s.y));
  const scale = Math.min(Math.max(24, w - 88) / Math.max(100, maxX - minX), Math.max(24, h - 100) / Math.max(100, maxY - minY)) * (Number.isFinite(zoom) && zoom > 0 ? Math.min(zoom, 8) : 1);
  const limit = Math.max(w, h) * 4;
  const offset = value => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
  const dx = offset(pan?.x), dy = offset(pan?.y);
  return systems.map(s => ({ x: w / 2 + (s.x - (minX + maxX) / 2) * scale + dx, y: h / 2 + (s.y - (minY + maxY) / 2) * scale + dy }));
}

function drawRoute(ctx, points, path, color, proposed = false) {
  if (path.length < 2) return;
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = proposed ? 1.8 : 1.3;
  ctx.setLineDash(proposed ? [4, 5] : []); ctx.beginPath();
  path.forEach((id, i) => i ? ctx.lineTo(points[id].x, points[id].y) : ctx.moveTo(points[id].x, points[id].y)); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 1; i < path.length; i++) {
    const a = points[path[i - 1]], b = points[path[i]], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length < 28) continue;
    const ux = dx / length, uy = dy / length, x = a.x + dx * .58, y = a.y + dy * .58;
    ctx.beginPath(); ctx.moveTo(x + ux * 4, y + uy * 4); ctx.lineTo(x - ux * 3 - uy * 3, y - uy * 3 + ux * 3); ctx.lineTo(x - ux * 3 + uy * 3, y - uy * 3 - ux * 3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function drawMap(canvas, state, engine, selected, selectedFleet, zoom = 1, mode = 'political', options = {}) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return [];
  const points = mapProjection(state.systems, w, h, zoom, options.pan);
  const dpr = canvas.ownerDocument?.defaultView?.devicePixelRatio ?? globalThis.devicePixelRatio;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1;
  const width = Math.max(1, Math.round(w * ratio)), height = Math.max(1, Math.round(h * ratio));
  // Assigning width/height destroys the backing store, even at the same size.
  // Retain it for selection redraws; recompute scale from rounded pixel sizes so
  // fractional browser zoom never drifts away from the CSS star targets.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return points;
  ctx.save(); ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]); ctx.shadowBlur = 0;
  drawBackdropReference(ctx, w, h, state.seed);
  const visible = engine.visibleSystems(state), known = new Set(state.empires[state.player ?? 0].known);
  const intel = new Map([...known].map(id => [id, engine.systemIntel(state, id)]));
  if (mode !== 'survey') for (const s of state.systems) if (known.has(s.id)) {
    const p = intel.get(s.id)?.planets.find(p => p.owner >= 0);
    if (p) { const point = points[s.id], color = engine.content.empires[p.owner].color; const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 80 * zoom); gradient.addColorStop(0, color + '20'); gradient.addColorStop(1, color + '00'); ctx.fillStyle = gradient; ctx.fillRect(point.x - 80 * zoom, point.y - 80 * zoom, 160 * zoom, 160 * zoom); }
  }
  for (const s of state.systems) for (const n of s.links) if (n > s.id && (known.has(s.id) || known.has(n))) {
    const a = points[s.id], b = points[n], ownerA = intel.get(s.id)?.planets.find(p => p.owner >= 0)?.owner, ownerB = intel.get(n)?.planets.find(p => p.owner >= 0)?.owner;
    ctx.strokeStyle = mode !== 'survey' && ownerA !== undefined && ownerA === ownerB ? engine.content.empires[ownerA].color + '80' : known.has(s.id) && known.has(n) ? '#7899ac80' : '#55778555'; ctx.lineWidth = 1;
    ctx.setLineDash(known.has(s.id) && known.has(n) ? [] : [3, 6]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  const ownedFleets = engine.fleets(state);
  if (mode === 'routes') for (const f of ownedFleets) drawRoute(ctx, points, [f.system, ...f.path], '#d4ae73a8');
  const fleet = ownedFleets.find(f => f.id === selectedFleet);
  if (fleet) {
    if (mode !== 'routes' && fleet.path.length) drawRoute(ctx, points, [fleet.system, ...fleet.path], '#d4ae73a8');
    const path = engine.route(state, fleet.system, selected);
    drawRoute(ctx, points, path, '#91edd4', true);
  }
  for (const s of state.systems) {
    const p = points[s.id];
    if (!visible.has(s.id)) { ctx.fillStyle = '#60738740'; ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
    if (known.has(s.id) && intel.get(s.id)?.archive) paintRelic(ctx, p.x + 25, p.y - 24, 11);
  }
  if (visible.has(selected)) {
    const p = points[selected]; ctx.strokeStyle = '#b3f6e9'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(p.x + x * 14, p.y + y * 21); ctx.lineTo(p.x + x * 21, p.y + y * 21); ctx.lineTo(p.x + x * 21, p.y + y * 14); }
    ctx.stroke();
  }
  ctx.restore();
  return points;
}
