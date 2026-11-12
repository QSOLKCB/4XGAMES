// SPDX-License-Identifier: Apache-2.0
import '../vendor/galaxy/data/uff-demo.js';
import '../vendor/galaxy/uff-physics.js';
import '../vendor/galaxy/galaxy-core.js';
import '../vendor/gluball/gluball-core.js';
import { bakePlanet } from '../vendor/offline-games/shared/surface-detail.js';
import { seededRandom } from '../vendor/vanillajs/modules/math/index.js';
import { BUILTIN_LIVERIES, hashText } from './liveries.js';

// Presentation contract: every function here reads state, pack and preference
// inputs and paints pixels. Nothing writes to the campaign, uses the wall clock
// or draws from the gameplay RNG. Cosmetic noise uses VANILLAJS seededRandom
// keyed by content identity, so the same input always paints the same pixels.

// OPT-INV-001: identical palette + fixed light + donor implementation => identical pixels.
// Only three finite palette keys; generated canvases never escape for mutation.
const planetTextures = new Map();
const ATMOSPHERE = { ocean: '#79cee4', gas: '#e6b77b', ice: '#cfe9ff' };
export function paintPlanet(canvas, palette = 'ocean', variant = 0, options = {}) {
  if (!['ocean', 'gas', 'ice'].includes(palette)) throw new Error('Unknown planet palette.');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  if (!planetTextures.has(palette)) planetTextures.set(palette, bakePlanet(palette));
  canvas.width = canvas.height = 256;
  ctx.clearRect(0, 0, 256, 256);
  const ring = palette === 'gas' && variant % 2 === 1, moon = variant >= 4, atmosphere = ATMOSPHERE[palette];
  const radius = ring ? 96 : 126;
  const halo = ctx.createRadialGradient(128, 128, radius * .82, 128, 128, radius + 2);
  halo.addColorStop(0, 'transparent'); halo.addColorStop(.85, atmosphere + '2c'); halo.addColorStop(1, atmosphere + '55');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(128, 128, radius + 2, 0, Math.PI * 2); ctx.fill();
  if (ring) {
    ctx.save(); ctx.translate(128, 128); ctx.rotate(-.35); ctx.strokeStyle = '#d4ae7360'; ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(0, 0, 123, 42, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.drawImage(planetTextures.get(palette), 32, 32, 192, 192);
    // The near half of the ring passes in front of the disc.
    ctx.save(); ctx.translate(128, 128); ctx.rotate(-.35); ctx.strokeStyle = '#e9c88a70'; ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(0, 0, 123, 42, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
  } else ctx.drawImage(planetTextures.get(palette), 0, 0);
  if (variant % 4 && !ring) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; const g = ctx.createRadialGradient(128, 128, 95, 128, 128, 127); g.addColorStop(0, 'transparent'); g.addColorStop(1, variant % 2 ? '#79cee44a' : '#e6b77b38'); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256); ctx.restore();
  }
  if (options.owner && options.pop > 0) {
    // Settled worlds show city lights on the night side (the donor bakes light from
    // the upper left), scaled by population and tinted by the owning empire.
    const rng = seededRandom(variant * 31 + 7), fraction = Math.min(1, options.pop / Math.max(1, options.max || options.pop));
    const count = Math.round(8 + fraction * 56);
    ctx.save(); ctx.beginPath(); ctx.arc(128, 128, radius - 3, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = options.owner;
    for (let i = 0; i < count; i++) {
      const nx = rng() * 2 - 1, ny = rng() * 2 - 1;
      if (nx * nx + ny * ny > .84 || nx * -.55 + ny * .45 > -.08) continue;
      const size = rng() < .25 ? 3 : 2;
      ctx.globalAlpha = .55 + rng() * .45; ctx.fillRect(128 + nx * radius - size / 2, 128 - ny * radius - size / 2, size, size);
    }
    ctx.restore();
  }
  if (moon) {
    const mx = ring ? 214 : 226, my = ring ? 60 : 52;
    const shade = ctx.createRadialGradient(mx - 5, my - 5, 2, mx, my, 13); shade.addColorStop(0, '#d9d2c6'); shade.addColorStop(.7, '#7d7a74'); shade.addColorStop(1, '#2d2c2b');
    ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.fill();
  }
  return true;
}

function hullPattern(ctx, pattern, family, dark, shadow) {
  ctx.strokeStyle = '#0c1c2a'; ctx.lineWidth = 2;
  if (pattern === 'plates' || pattern === 'ribs' && family === 1) {
    for (let y = -40; y < 50; y += 13) {
      ctx.beginPath(); ctx.moveTo(-50, y);
      if (family === 1) ctx.quadraticCurveTo(0, y + 20, 50, y); else ctx.lineTo(50, y + (family === 0 ? 11 : 0));
      ctx.stroke();
    }
  } else if (pattern === 'ribs') {
    ctx.lineWidth = 1.6; for (let x = -45; x <= 45; x += 9) { ctx.beginPath(); ctx.moveTo(x, -55); ctx.lineTo(x + (family === 0 ? 4 : 0), 55); ctx.stroke(); }
  } else if (pattern === 'lattice') {
    ctx.lineWidth = 1.2; ctx.strokeStyle = shadow + 'c0';
    for (let k = -110; k <= 110; k += 12) { ctx.beginPath(); ctx.moveTo(k - 60, -60); ctx.lineTo(k + 60, 60); ctx.moveTo(k + 60, -60); ctx.lineTo(k - 60, 60); ctx.stroke(); }
  } else if (pattern === 'hex') {
    ctx.lineWidth = .9; ctx.strokeStyle = shadow + 'd0';
    for (let row = -5; row <= 5; row++) for (let col = -5; col <= 5; col++) {
      const x = col * 10 + (row % 2 ? 5 : 0), y = row * 9;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; i ? ctx.lineTo(x + Math.cos(a) * 4.6, y + Math.sin(a) * 4.6) : ctx.moveTo(x + Math.cos(a) * 4.6, y + Math.sin(a) * 4.6); } ctx.closePath(); ctx.stroke();
    }
  } else if (pattern === 'stripes') {
    ctx.fillStyle = shadow + 'b0';
    for (let k = -70; k <= 70; k += 14) { ctx.beginPath(); ctx.moveTo(k, 8); ctx.lineTo(k + 7, 8); ctx.lineTo(k + 25, 44); ctx.lineTo(k + 18, 44); ctx.closePath(); ctx.fill(); }
    ctx.lineWidth = 1.4; ctx.strokeStyle = dark; ctx.beginPath(); ctx.moveTo(-50, 8); ctx.lineTo(50, 8); ctx.moveTo(-50, 44); ctx.lineTo(50, 44); ctx.stroke();
  } else {
    const sheen = ctx.createLinearGradient(-30, -50, 30, 50); sheen.addColorStop(.35, 'transparent'); sheen.addColorStop(.5, '#ffffff33'); sheen.addColorStop(.65, 'transparent');
    ctx.fillStyle = sheen; ctx.fillRect(-60, -60, 120, 120);
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-50, 24); ctx.lineTo(50, 24); ctx.stroke();
  }
}
function hullTrim(ctx, trim, empire) {
  ctx.fillStyle = ctx.strokeStyle = empire.color;
  if (trim === 'racing') { ctx.globalAlpha = .65; ctx.fillRect(-4, -38, 3, 68); ctx.globalAlpha = 1; }
  else if (trim === 'bands') { ctx.globalAlpha = .7; ctx.fillRect(-60, -9, 120, 3.2); ctx.fillRect(-60, 17, 120, 3.2); ctx.globalAlpha = 1; }
  else if (trim === 'wedge') { ctx.globalAlpha = .8; ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(9, -24); ctx.lineTo(-9, -24); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
  else if (trim === 'chevron') {
    ctx.lineWidth = 2.4; ctx.globalAlpha = .85;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 34, -6); ctx.lineTo(side * 22, 6); ctx.lineTo(side * 34, 18); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
}
// Role decals describe the installed parts. They are drawn from the design's
// role list only, so an enemy design seen through old intelligence never leaks.
function roleDecals(ctx, roles, empire, light) {
  if (roles.includes('survey')) { ctx.strokeStyle = empire.accent; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, -24, 7, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); ctx.fillStyle = empire.accent; ctx.fillRect(-1, -27, 2, 4); }
  if (roles.includes('colony')) { for (const x of [-15, 15]) { ctx.fillStyle = empire.accent + '55'; ctx.beginPath(); ctx.arc(x, 9, 5.2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = light; ctx.lineWidth = 1; ctx.stroke(); } }
  if (roles.includes('assault')) { ctx.fillStyle = empire.accent; for (let i = -1; i <= 1; i++) ctx.fillRect(i * 7 - 2, 20, 4, 7); }
  if (roles.includes('weapon')) { ctx.fillStyle = light; for (const x of [-20, 17.8]) { ctx.fillRect(x, -32, 2.2, 17); ctx.fillStyle = '#0c1c2a'; ctx.fillRect(x - .6, -34, 3.4, 3); ctx.fillStyle = light; } }
}
export function paintShip(canvas, hull, empire, large = false, options = {}) {
  const ctx = canvas.getContext('2d'), w = large ? 600 : 180, h = large ? 500 : 180;
  if (!ctx) return false;
  const livery = options.livery || BUILTIN_LIVERIES[0], roles = Array.isArray(options.roles) ? options.roles : [];
  const [light, mid, dark, shadow] = livery.hull;
  canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);
  // Imported polygons may reach every corner of the admitted −60…60 square.
  // Fit their circumradius so the preview never clips a valid hull when rotated.
  const radius = Math.max(1, ...hull.shape.map(([x, y]) => Math.hypot(x, y)));
  const scale = Math.min(large ? 3.1 : 1.32, (Math.min(w, h) / 2 - (large ? 28 : 16)) / radius);
  const family = [...empire.short].reduce((sum, ch) => sum + ch.codePointAt(0), 0) % 3;
  ctx.save(); ctx.translate(w / 2, h / 2);
  ctx.rotate(large ? -.38 : -.35); ctx.scale(scale, scale);
  const shape = () => { ctx.beginPath(); hull.shape.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
  // Engine bloom, paneling, trim and decals are cosmetic; the editable polygon owns the silhouette.
  const flameTint = livery.flame === 'ion' ? '#a4ecff' : livery.flame === 'ember' ? '#ffb45e' : empire.color;
  const flame = ctx.createLinearGradient(0, 30, 0, 76); flame.addColorStop(0, flameTint); flame.addColorStop(.45, empire.color + 'aa'); flame.addColorStop(1, 'transparent');
  ctx.fillStyle = flame;
  const nozzles = family === 0 ? [-13, 7] : family === 1 ? [-4] : [-19, -4, 11];
  for (const x of nozzles) ctx.fillRect(x, 33, 8, livery.flame === 'plasma' ? 40 : 34);
  ctx.fillStyle = '#ffffffb0'; for (const x of nozzles) ctx.fillRect(x + 2.5, 33, 3, 9);
  shape(); ctx.shadowColor = empire.color; ctx.shadowBlur = 6 + livery.glow * 14; ctx.fillStyle = empire.color + '66'; ctx.fill(); ctx.shadowBlur = 0;
  const metal = ctx.createLinearGradient(-45, -45, 45, 40); metal.addColorStop(0, light); metal.addColorStop(.43, mid); metal.addColorStop(.48, dark); metal.addColorStop(1, shadow);
  shape(); ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = empire.color; ctx.lineWidth = .65; ctx.stroke();
  ctx.save(); shape(); ctx.clip();
  hullPattern(ctx, livery.pattern, family, dark, shadow);
  hullTrim(ctx, livery.trim, empire);
  ctx.fillStyle = '#07131b'; ctx.fillRect(-6, -17, 12, 18); ctx.strokeStyle = empire.accent; ctx.lineWidth = .6; ctx.strokeRect(-6, -17, 12, 18);
  ctx.fillStyle = empire.accent; ctx.fillRect(-3, -14, 6, 6);
  ctx.fillStyle = '#a7bac5'; ctx.fillRect(-21, 9, 4, 13); ctx.fillRect(17, 9, 4, 13);
  ctx.fillStyle = '#132332'; ctx.fillRect(-24, 26, 11, 8); ctx.fillRect(13, 26, 11, 8);
  ctx.fillStyle = empire.accent; ctx.globalAlpha = .8;
  for (let i = 0; i < 3; i++) { ctx.fillRect(-18, 3 + i * 5, 3, 1.4); ctx.fillRect(15, 3 + i * 5, 3, 1.4); }
  ctx.globalAlpha = 1;
  roleDecals(ctx, roles, empire, light);
  if (livery.wear > 0) {
    const rng = seededRandom(hashText(hull.id) + 1), scratches = Math.round(6 + livery.wear * 18);
    ctx.strokeStyle = shadow; ctx.lineWidth = .8; ctx.globalAlpha = .25 + livery.wear * .45;
    for (let i = 0; i < scratches; i++) { const x = rng() * 90 - 45, y = rng() * 90 - 45; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng() * 9 - 4.5, y + rng() * 9 - 4.5); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (roles.includes('shield')) { shape(); ctx.strokeStyle = empire.accent + '55'; ctx.lineWidth = 3.2; ctx.stroke(); }
  ctx.restore();
  if (large) {
    ctx.strokeStyle = '#486276'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(50, h / 2); ctx.lineTo(w - 50, h / 2); ctx.moveTo(w / 2, 25); ctx.lineTo(w / 2, h - 25); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '11px monospace'; ctx.fillStyle = '#7292a5'; ctx.fillText('HULL / ' + hull.slots + ' SLOTS', 25, 30); ctx.fillText('TOP PROJECTION', w - 140, h - 25);
    ctx.fillText('LIVERY / ' + livery.name.toUpperCase(), 25, 48);
    if (roles.length) ctx.fillText('FITTED / ' + roles.map(r => r.toUpperCase()).join(' · '), 25, 66);
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
// Decorative spectral classes: a stable hash of the campaign seed and system ID.
// They never affect yields, routes or any rule; packs do not need to declare them.
const SPECTRA = [['O', '#9fc4ff', 3], ['B', '#bcd8ff', 10], ['A', '#e8f0ff', 20], ['F', '#fff7e0', 35], ['G', '#ffe7a6', 60], ['K', '#ffc78a', 80], ['M', '#ff9b7a', 100]];
export function spectralClass(systemId, seed) {
  const roll = hashText(`${seed}:${systemId}`) % 100;
  const [name, color] = SPECTRA.find(([, , limit]) => roll < limit);
  return { name, color };
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
export function drawBackdropReference(ctx, w, h, seed, detail = 'full') {
  ctx.fillStyle = '#080f19'; ctx.fillRect(0, 0, w, h);
  for (const [x, y, radius, color] of [[w * .6, h * .4, w * .7, '#172737'], [w * .25, h * .8, w * .38, '#183b3b'], [w * .8, h * .1, w * .4, '#251d35']]) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  }
  // Fixed, low-contrast dust filaments. They use no animation clock or gameplay
  // RNG, and are redrawn directly on the same Canvas2D path as the reference.
  const drift = (seed % 97) / 97;
  if (detail !== 'lean') for (let i = 0; i < 3; i++) {
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
  if (detail === 'lean') return;
  ctx.strokeStyle = '#5e839313'; ctx.lineWidth = .5;
  for (let x = 30; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 30; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.font = '9px monospace'; ctx.fillStyle = '#7893a345';
  for (let x = 90; x < w - 50; x += 180) ctx.fillText(String(Math.round(x)).padStart(3, '0'), x + 4, 15);
  for (let y = 90; y < h - 50; y += 180) ctx.fillText(String(Math.round(y)).padStart(3, '0'), 7, y - 5);
}

// All values are CSS pixels: DOM star targets and canvas geometry share this
// projection even if the context is unavailable or backing pixels use a new DPR.
export function chartTransform(systems, w, h, zoom = 1, pan = {}) {
  if (!systems.length || !(w > 0 && h > 0)) return null;
  const minX = Math.min(...systems.map(s => s.x)), maxX = Math.max(...systems.map(s => s.x));
  const minY = Math.min(...systems.map(s => s.y)), maxY = Math.max(...systems.map(s => s.y));
  const scale = Math.min(Math.max(24, w - 88) / Math.max(100, maxX - minX), Math.max(24, h - 100) / Math.max(100, maxY - minY)) * (Number.isFinite(zoom) && zoom > 0 ? Math.min(zoom, 8) : 1);
  const limit = Math.max(w, h) * 4;
  const offset = value => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
  return { scale, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2, dx: offset(pan?.x), dy: offset(pan?.y), w, h };
}
export function mapProjection(systems, w, h, zoom = 1, pan = {}) {
  const t = chartTransform(systems, w, h, zoom, pan);
  if (!t) return [];
  return systems.map(s => ({ x: w / 2 + (s.x - t.midX) * t.scale + t.dx, y: h / 2 + (s.y - t.midY) * t.scale + t.dy }));
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

export const MAP_MODES = ['political', 'survey', 'routes', 'intel'];
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
  drawBackdropReference(ctx, w, h, state.seed, options.detail);
  const player = state.player ?? 0, empires = engine.content.empires, mine = empires[player].color;
  const visible = engine.visibleSystems(state), known = new Set(state.empires[player].known);
  const intel = new Map([...known].map(id => [id, engine.systemIntel(state, id)]));
  const ownerOf = id => intel.get(id)?.planets.find(p => p.owner >= 0)?.owner;
  if (mode !== 'survey') for (const s of state.systems) if (known.has(s.id)) {
    const owner = ownerOf(s.id);
    if (owner !== undefined) {
      const point = points[s.id], color = empires[owner].color;
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 80 * zoom); gradient.addColorStop(0, color + '20'); gradient.addColorStop(1, color + '00'); ctx.fillStyle = gradient; ctx.fillRect(point.x - 80 * zoom, point.y - 80 * zoom, 160 * zoom, 160 * zoom);
      ctx.strokeStyle = color + '38'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(point.x, point.y, 30 * zoom, 0, Math.PI * 2); ctx.stroke();
    }
  }
  for (const s of state.systems) for (const n of s.links) if (n > s.id && (known.has(s.id) || known.has(n))) {
    const a = points[s.id], b = points[n], ownerA = ownerOf(s.id), ownerB = ownerOf(n), both = known.has(s.id) && known.has(n);
    const owned = mode !== 'survey' && ownerA !== undefined && ownerA === ownerB;
    if (owned) { ctx.strokeStyle = empires[ownerA].color + '22'; ctx.lineWidth = 5; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.strokeStyle = owned ? empires[ownerA].color + '80' : both ? '#7899ac80' : '#55778555'; ctx.lineWidth = 1;
    ctx.setLineDash(both ? [] : [3, 6]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
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
  const stationed = new Set(ownedFleets.map(f => f.system));
  for (const s of state.systems) {
    const p = points[s.id];
    if (!visible.has(s.id)) { ctx.fillStyle = '#60738740'; ctx.fillRect(p.x - 1, p.y - 1, 2, 2); continue; }
    const report = known.has(s.id) ? intel.get(s.id) : null;
    if (report?.archive) paintRelic(ctx, p.x + 25, p.y - 24, 11);
    // Friendly orbit arc and last-reported hostile ring use the same chart the
    // player's star controls use: own fleets plus current/last-seen intelligence.
    if (stationed.has(s.id)) { ctx.strokeStyle = mine + 'a0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 15, -.55, 1.25); ctx.stroke(); }
    if (report?.fleets.some(f => f.owner !== player && state.relations[player][f.owner] === 'war' && f.attack > 0)) {
      ctx.strokeStyle = '#f28b71b0'; ctx.lineWidth = 1.1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (mode === 'intel' && report) {
      const age = report.current ? 0 : Math.max(0, state.turn - report.turn), alpha = report.current ? 1 : Math.max(.18, 1 - age / 24);
      ctx.globalAlpha = alpha; ctx.strokeStyle = report.current ? '#91edd4' : '#c9b18a'; ctx.lineWidth = report.current ? 1.4 : 1; ctx.setLineDash(report.current ? [] : [2, 3]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '8px monospace'; ctx.fillStyle = report.current ? '#91edd4' : '#c9b18a'; ctx.fillText(report.current ? 'LIVE' : `T${String(report.turn).padStart(3, '0')}`, p.x + 14, p.y + 30);
      ctx.globalAlpha = 1;
    }
  }
  if (visible.has(selected)) {
    const p = points[selected];
    const focus = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 34); focus.addColorStop(0, mine + '2a'); focus.addColorStop(1, mine + '00'); ctx.fillStyle = focus; ctx.fillRect(p.x - 34, p.y - 34, 68, 68);
    ctx.strokeStyle = '#b3f6e9'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(p.x + x * 14, p.y + y * 21); ctx.lineTo(p.x + x * 21, p.y + y * 21); ctx.lineTo(p.x + x * 21, p.y + y * 14); }
    ctx.stroke();
  }
  ctx.restore();
  return points;
}
// The minimap is a second, pan-free projection of the same chart. Its viewport
// rectangle is the main chart's visible area mapped back through chartTransform.
export function drawMinimap(canvas, state, engine, main) {
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  const points = mapProjection(state.systems, w, h, 1, {});
  if (!points.length) return [];
  const dpr = canvas.ownerDocument?.defaultView?.devicePixelRatio ?? globalThis.devicePixelRatio;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1;
  const width = Math.max(1, Math.round(w * ratio)), height = Math.max(1, Math.round(h * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return points;
  ctx.save(); ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
  ctx.fillStyle = '#070d15'; ctx.fillRect(0, 0, w, h);
  const player = state.player ?? 0, empires = engine.content.empires, visible = engine.visibleSystems(state), known = new Set(state.empires[player].known);
  ctx.strokeStyle = '#51677a60'; ctx.lineWidth = .6;
  for (const s of state.systems) for (const n of s.links) if (n > s.id && known.has(s.id) && known.has(n)) { ctx.beginPath(); ctx.moveTo(points[s.id].x, points[s.id].y); ctx.lineTo(points[n].x, points[n].y); ctx.stroke(); }
  for (const s of state.systems) {
    if (!visible.has(s.id)) continue;
    const p = points[s.id], owner = known.has(s.id) ? engine.systemIntel(state, s.id)?.planets.find(x => x.owner >= 0)?.owner : undefined;
    ctx.fillStyle = owner !== undefined ? empires[owner].color : known.has(s.id) ? '#c3d0d9' : '#62748a';
    const size = owner !== undefined ? 4 : known.has(s.id) ? 2.6 : 1.8;
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  const mainT = chartTransform(state.systems, main.w, main.h, main.zoom, main.pan), miniT = chartTransform(state.systems, w, h, 1, {});
  if (mainT && miniT) {
    const toMini = (px, py) => [w / 2 + (px - main.w / 2 - mainT.dx) / mainT.scale * miniT.scale, h / 2 + (py - main.h / 2 - mainT.dy) / mainT.scale * miniT.scale];
    const [x0, y0] = toMini(0, 0), [x1, y1] = toMini(main.w, main.h);
    ctx.strokeStyle = empires[player].color + 'c0'; ctx.lineWidth = 1; ctx.strokeRect(Math.max(.5, x0), Math.max(.5, y0), Math.min(w - 1, x1) - Math.max(.5, x0), Math.min(h - 1, y1) - Math.max(.5, y0));
  }
  ctx.restore();
  return points;
}
