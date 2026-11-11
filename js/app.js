// SPDX-License-Identifier: Apache-2.0
import { parsePack, loadPack, loadDirectory, PACK_FILES } from './content.js';
import { createEngine } from './core.js';
import { drawMap, paintPlanet, paintShip, paintRelic } from './render.js';
import { Soundscape } from './audio.js';
import { campaigns } from '../mods/registry.js';
import '../vendor/games/shared/qsol-input.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const paths = {
  galaxy: 'M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l3 3m6.8 6.8 3 3M5.6 18.4l3-3m6.8-6.8 3-3M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  colonies: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0M2 17l20-10M8 5l2 4-2 3 4 2 1 5',
  fleets: 'm12 2 8 18-8-4-8 4zM12 2v14',
  research: 'M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10',
  designer: 'm12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
  diplomacy: 'M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M2 21v-3a6 6 0 0 1 12 0v3M16 5a4 4 0 0 1 0 7m1 3a5 5 0 0 1 5 5',
  reports: 'M5 3h14v18H5zM8 7h8m-8 5h8m-8 5h5',
  mods: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  minerals: 'm12 2 8 6-3 12H7L4 8zM4 8h16M7 20l5-12 5 12M12 2v6',
  energy: 'm13 2-9 12h7l-1 8 10-12h-7z',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  save: 'M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8',
  help: 'M8 8a4 4 0 1 1 6 3.5c-2 1-2 2-2 3M12 18h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  sound: 'm3 9 5 0 5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.galaxy}"/></svg>`;
const number = n => n.toLocaleString('en');
const plus = n => (n >= 0 ? '+' : '') + number(n);
const roman = n => ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] || n;
const btn = (label, action, extra = '', style = '') => `<button class="${style}" data-action="${action}" ${extra}>${label}</button>`;
let pack, engine, state, extension = null, activeKey = '', view = 'galaxy', selected = 12, selectedFleet = null, mapMode = 'political', zoom = 1;
let designer = null, toastTimer, mapObserver, gamepadTimer, previewEpoch = 0;
const audio = new Soundscape();
const gamepad = new globalThis.QsolInput.GamepadReader();
const packCache = new Map();
async function registered(id) {
  const spec = campaigns.find(c => c.id === id); if (!spec) throw new Error('Unknown installed campaign.');
  if (!packCache.has(id)) packCache.set(id, await loadPack(spec.base));
  return { pack: packCache.get(id), hooks: spec.hooks, extension: id };
}
async function fingerprint(raw) {
  const bytes = new TextEncoder().encode(JSON.stringify(PACK_FILES.map(f => raw[f + '.txt'])));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `toast visible${error ? ' error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), error ? 6500 : 3700); }
function closeDialog() { $('#dialog').close(); }
function modal(title, body) { $('#dialog').innerHTML = `<div class="dialog-head"><h2>${title}</h2>${btn('✕', 'close', 'aria-label="Close dialog"', 'quiet small')}</div><div class="dialog-body">${body}</div>`; if (!$('#dialog').open) $('#dialog').showModal(); }
function saveEnvelope() { return { kind: 'voidward.save.v1', extension, pack: pack.raw, state }; }
function autoSave() {
  try { localStorage.setItem(activeKey, JSON.stringify(saveEnvelope())); localStorage.setItem('voidward.active.v1', activeKey); return true; }
  catch { toast('Browser storage unavailable or full. Export your save to keep this campaign.', true); return false; }
}
async function activate(candidatePack, hooks, source, saved = null, seed = 2401, difficulty = 'standard') {
  const candidateEngine = createEngine(candidatePack, hooks), candidateState = saved || candidateEngine.createGame(seed, difficulty);
  candidateEngine.validateState(candidateState);
  const hash = await fingerprint(candidatePack.raw);
  pack = candidatePack; engine = candidateEngine; state = candidateState; extension = source;
  activeKey = `voidward.save.v1.${pack.meta.id}@${pack.meta.version}.${hash}.${source || 'text'}`;
  selected = pack.empires[0].home; selectedFleet = null; designer = null; view = 'galaxy'; zoom = 1;
  audio.setScore(pack.music); audio.resume(); autoSave(); closeDialog(); render();
}
async function importSave(text) {
  if (text.length > 2000000) throw new Error('Save files must be smaller than 2 MB.');
  const data = JSON.parse(text);
  if (!data || data.kind !== 'voidward.save.v1' || !data.state || typeof data.state !== 'object' || Array.isArray(data.state) || !(data.extension === null || typeof data.extension === 'string')) throw new Error('Choose a VOIDWARD save file.');
  const candidatePack = parsePack(data.pack);
  let hooks = {};
  if (data.extension !== null) {
    const installed = await registered(data.extension);
    if (await fingerprint(installed.pack.raw) !== await fingerprint(candidatePack.raw)) throw new Error('This save needs a different version of its installed source mod. Restore that campaign version, or import a data-only campaign.');
    hooks = installed.hooks;
  }
  await activate(candidatePack, hooks, data.extension, data.state);
}
function act(action) {
  try {
    const candidate = structuredClone(state);
    action.type === 'endTurn' ? engine.endTurn(candidate) : engine.command(candidate, action);
    engine.validateState(candidate); state = candidate; autoSave();
    if (selectedFleet && !state.fleets.some(f => f.id === selectedFleet)) selectedFleet = null;
    audio.effect(action.type === 'endTurn' ? (state.battles[0]?.turn === state.turn ? 'alert' : 'order') : action.type === 'colonize' ? 'bank' : 'select');
    render(); return true;
  } catch (error) { toast(error.message, true); return false; }
}
function download(name, text, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function ownerName(owner) { return owner < 0 ? 'Unclaimed world' : pack.empires[owner].name; }
function shipCanvas(design, owner = 0, large = false) { return `<canvas data-ship="${esc(design.hull)}" data-owner="${owner}" ${large ? 'data-large="true"' : ''} role="img" aria-label="${esc(pack.hulls[design.hull].name)} ship silhouette"></canvas>`; }
function planetCanvas(p) { return `<canvas data-planet="${esc(pack.planets[p.type].palette)}" role="img" aria-label="${esc(pack.planets[p.type].name)} planet"></canvas>`; }
function progress(value, total) { return `<div class="progress" style="--progress:${Math.min(100, Math.max(0, value / total * 100))}%"><span></span></div>`; }
function pageHead(eyebrow, title, subtitle, actions = '') { return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="page-actions">${actions}</div></div>`; }
function render() {
  previewEpoch++;
  const e = state.empires[0], yields = engine.income(state), owned = engine.colonies(state), ships = engine.fleets(state);
  const nav = [['galaxy', 'Galaxy map', '01'], ['colonies', 'Colonies', owned.length], ['fleets', 'Fleets', ships.length], ['research', 'Research', '04'], ['designer', 'Ship designer', '05'], ['diplomacy', 'Diplomacy', '06'], ['reports', 'Turn reports', state.log.length], ['mods', 'Campaign workshop', '08']];
  const victory = state.winner === null ? '' : `<div class="victory-banner"><div><div class="eyebrow">${state.winner === 0 ? 'A NEW AGE BEGINS' : 'THE FRONTIER REMEMBERS'}</div><h2>${esc(pack.empires[state.winner].name)} prevails</h2><p>${esc(state.victory)}</p></div>${btn('New expedition', 'new', '', 'primary')}</div>`;
  $('#app').innerHTML = `<header class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">V</div><div><strong>VOIDWARD</strong><small>A QSOL-IMC SPACE 4X</small></div></div><div class="resources">${[['minerals', 'MINERALS'], ['energy', 'ENERGY'], ['research', 'RESEARCH']].map(([key, label]) => { const field = key === 'research' ? 'science' : key; return `<div class="resource" title="${field === 'energy' ? 'Net energy after fleet upkeep. At zero energy, fleet attack is halved.' : label + ' stockpile and yield per turn'}">${icon(key)}<span>${number(e[field])}<b>${plus(yields[field])}</b></span><small>${label}</small></div>`; }).join('')}</div><div class="turn-count"><strong>TURN ${String(state.turn).padStart(3, '0')}</strong><small>STARDATE ${2400 + Math.floor(state.turn / 10)}.${state.turn % 10}</small></div>${btn(`End turn ${icon('arrow')}`, 'end', state.winner !== null ? 'disabled' : '', 'primary end-turn')}</header>
  <div class="shell"><aside class="sidebar"><div class="empire-sign"><div class="sigil">⌁</div><div><strong>${esc(pack.empires[0].short)}</strong><small>HIGH COMMAND</small></div></div><nav class="nav" aria-label="Empire command">${nav.map(([id, title, count]) => `<button data-view="${id}" class="${view === id ? 'active' : ''}" aria-label="${title}" ${view === id ? 'aria-current="page"' : ''} title="${title}">${icon(id)}<span>${title}</span><span class="badge">${String(count).padStart(2, '0')}</span></button>`).join('')}</nav>
  <div><div class="sidebar-heading">EMPIRE DIRECTIVE</div><div class="objective"><div class="eyebrow">BEYOND THE HORIZON</div><p>${owned.length < 2 ? 'Send a fleet to a neighbouring star. Establish your first frontier colony.' : `Establish ${pack.rules.colonyTarget} colonies, master all sciences, or become the last empire standing.`}</p>${progress(owned.length, pack.rules.colonyTarget)}<div class="row between" style="margin-top:10px"><small>COLONIES</small><small class="mono">${owned.length} / ${pack.rules.colonyTarget}</small></div></div></div>
  <div class="side-tools">${btn('Save / load', 'saves', '', 'quiet')}${btn(audio.enabled ? 'Sound on' : 'Sound off', 'sound', `aria-pressed="${audio.enabled}"`, 'quiet')}${btn('New game', 'new', '', 'quiet')}${btn('Field manual', 'help', '', 'quiet')}</div><div class="side-credit">EXPLORE. EXPAND.<br>EXPLOIT. EXTERMINATE.</div></aside>
  <main id="main" class="main" tabindex="-1">${victory}${({ galaxy: galaxyView, colonies: coloniesView, fleets: fleetsView, research: researchView, designer: designerView, diplomacy: diplomacyView, reports: reportsView, mods: modsView }[view] || galaxyView)()}</main></div>
  <footer class="footer"><span><i class="status-dot"></i>${esc(pack.meta.title.toUpperCase())} <span style="color:#394c5b"> / </span> TURN ${state.turn} <span style="color:#394c5b"> / </span> SEED ${state.seed}</span><span>LOCAL COMMAND · VANILLAJS + ALIEN MATH</span></footer>`;
  paintCanvases(); mapObserver?.disconnect();
  if ($('#galaxy-canvas')) { drawGalaxy(); mapObserver = new ResizeObserver(drawGalaxy); mapObserver.observe($('#galaxy-canvas')); }
}
function paintCanvases(root = document) {
  root.querySelectorAll('canvas[data-planet]').forEach(c => paintPlanet(c, c.dataset.planet));
  root.querySelectorAll('canvas[data-ship]').forEach(c => paintShip(c, pack.hulls[c.dataset.ship], pack.empires[Number(c.dataset.owner)], c.dataset.large === 'true'));
}
function galaxyView() {
  return pageHead('STELLAR CARTOGRAPHY', 'The known frontier', `${state.empires[0].known.length} systems surveyed · ${state.systems.length} stars in the sector`, `${btn(icon('help'), 'help', 'aria-label="Open field manual"', 'quiet')}${btn('Save / load', 'saves', '', 'quiet')}`) +
  `<div class="chart-layout"><div><section class="card chart-card" aria-label="Interactive galaxy map"><div class="chart-toolbar"><div class="segmented" aria-label="Map display">${[['political', 'Territory'], ['survey', 'Exploration'], ['routes', 'Fleet orders']].map(([id, label]) => btn(label, 'map-mode', `data-mode="${id}" aria-pressed="${mapMode === id}"`, mapMode === id ? 'active' : '')).join('')}</div><span class="mono muted" style="font-size:9px">SECTOR ${String(state.seed % 999).padStart(3, '0')} / ${pack.rules.columns} : ${pack.rules.rows}</span></div><div class="chart-viewport"><canvas id="galaxy-canvas" aria-hidden="true"></canvas><div id="stars" class="star-layer" role="group" aria-label="Select a star system"></div><div class="map-coordinates">DEEP SPACE NETWORK<br><span class="mint">●</span> TELEMETRY ONLINE</div><div class="map-void">THE UNCHARTED REACH</div><div class="map-controls">${btn('−', 'zoom-out', 'aria-label="Zoom out"')}${btn('⌖', 'zoom-reset', 'aria-label="Fit galaxy"')}${btn('+', 'zoom-in', 'aria-label="Zoom in"')}</div></div><div class="map-legend"><span><i class="legend-dot" style="--dot:var(--mint)"></i>YOUR EMPIRE</span><span><i class="legend-dot" style="--dot:var(--gold)"></i>UNCLAIMED</span><span><i class="legend-dot" style="--dot:#647589"></i>UNSURVEYED</span><span class="gold">⌘ ANCIENT ARCHIVE</span></div></section>
  <div class="card dispatch-strip">${icon('fleets')}<div><strong>${selectedFleet ? 'Fleet selected · choose a destination' : 'Your next command'}</strong><p>${selectedFleet ? 'Select a connected star, then confirm Plot course. Orders resolve when you end the turn.' : 'Select a ship in the system panel, then a neighbouring star to chart its course.'}</p></div></div></div><aside class="inspector" aria-label="Selected system">${inspector()}</aside></div>`;
}
function drawGalaxy() {
  const canvas = $('#galaxy-canvas'); if (!canvas) return;
  const points = drawMap(canvas, state, engine, selected, selectedFleet, zoom, mapMode), visible = engine.visibleSystems(state), known = new Set(state.empires[0].known);
  $('#stars').innerHTML = state.systems.filter(s => visible.has(s.id)).map(s => {
    const p = state.planets.find(p => p.system === s.id && p.owner >= 0), color = known.has(s.id) && p ? pack.empires[p.owner].color : '#c9b18a';
    const count = engine.fleets(state).filter(f => f.system === s.id).length;
    const label = known.has(s.id) ? s.name : `${s.name} · unsurveyed`;
    return `<button class="star-node ${known.has(s.id) ? '' : 'frontier'} ${selected === s.id ? 'selected' : ''}" style="left:${points[s.id].x}px;top:${points[s.id].y}px;--star:${color}" data-action="system" data-id="${s.id}" aria-label="${esc(label)}" aria-pressed="${selected === s.id}" title="${esc(label)}"><i></i><span>${esc(s.name)}</span>${count ? `<b class="fleet-count">▴ ${count}</b>` : ''}</button>`;
  }).join('');
}
function inspector() {
  const sys = state.systems[selected], known = state.empires[0].known.includes(selected), local = engine.fleets(state).filter(f => f.system === selected), ship = state.fleets.find(f => f.id === selectedFleet);
  const planets = known ? state.planets.filter(p => p.system === selected) : [];
  const planetRows = planets.map(p => {
    const ark = local.find(f => engine.role(f.design, 'colony'));
    return `<div class="planet-row">${planetCanvas(p)}<div><h3>${esc(p.name)}</h3><small>${esc(pack.planets[p.type].name)} · ${p.owner === 0 ? `${p.pop}M colonists` : esc(ownerName(p.owner))}</small>${p.owner === 0 ? btn('Manage colony', 'manage', `data-id="${p.id}"`, 'small quiet') : p.owner === -1 && ark ? btn('Colonise', 'colonize', `data-planet="${p.id}" data-fleet="${ark.id}"`, 'small primary') : `<small>${p.owner < 0 ? `Capacity ${pack.planets[p.type].max}M · mineral yield ${pack.planets[p.type].minerals}` : 'Sovereign territory'}</small>`}</div></div>`;
  }).join('');
  const route = ship ? engine.route(state, ship.system, selected) : [];
  const order = ship ? `<div class="selected-order"><div class="eyebrow">${esc(ship.name)}</div><p>${ship.system === selected ? 'Select a neighbouring star to prepare a destination.' : route.length ? `${route.length - 1} warp lane(s) · ${Math.ceil((route.length - 1) / engine.designStats(ship.design).speed)} turn(s)` : 'No known route to this destination.'}</p>${btn('Plot course →', 'move', `data-target="${selected}" ${route.length < 2 ? 'disabled' : ''}`, 'primary')}${ship.path.length ? `<p>Current order: ${esc(state.systems[ship.path.at(-1)].name)}</p>${btn('Cancel order', 'hold', '', 'quiet small')}` : ''}</div>` : '';
  return `<section class="card"><div class="system-hero"><div class="eyebrow">${known ? 'SYSTEM INTELLIGENCE' : 'FRONTIER SIGNAL'}</div><h2>${esc(sys.name)}</h2><span class="pill">${known ? planets.some(p => p.owner === 0) ? esc(pack.empires[0].short + ' SPACE') : 'SURVEY COMPLETE' : 'AWAITING SURVEY'}</span></div><div class="system-meta"><span>${known ? planets.length + ' WORLDS' : 'UNKNOWN WORLDS'}</span><span>${sys.links.length} WARP LANES</span></div>${known ? planetRows : '<div class="empty">Send a ship to survey this star. Its worlds and inhabitants will appear on arrival.</div>'}${known && sys.relic && !sys.claimed ? '<div class="card-pad gold" style="font-size:11px">⌘ Ancient archive detected. Bring a survey array to recover it.</div>' : ''}</section>
  <section class="card"><div class="card-head"><h3>FLEETS IN SYSTEM</h3><small>${local.length} FRIENDLY</small></div>${local.map(f => `<button class="fleet-row ${selectedFleet === f.id ? 'active' : ''}" data-action="select-fleet" data-id="${f.id}" aria-pressed="${selectedFleet === f.id}">${shipCanvas(f.design)}<div><strong>${esc(f.name)}</strong><small>${esc(pack.hulls[f.design.hull].name)} · ${f.path.length ? 'UNDER ORDERS' : 'AWAITING ORDERS'}</small></div><i class="indicator"></i></button>`).join('') || '<div class="empty">No friendly ships in orbit.</div>'}${known ? state.fleets.filter(f => f.system === selected && f.owner !== 0).map(f => `<div class="fleet-row">${shipCanvas(f.design, f.owner)}<div><strong>${esc(f.name)}</strong><small>${esc(pack.empires[f.owner].short)} · ${state.relations[0][f.owner].toUpperCase()}</small></div></div>`).join('') : ''}${order}</section>`;
}
function coloniesView() {
  const cols = engine.colonies(state);
  return pageHead('COLONIAL ADMINISTRATION', 'Your colony worlds', `${cols.length} colonies · ${cols.reduce((n, p) => n + p.pop, 0)} million citizens`, btn('Field manual', 'help', '', 'quiet')) + `<div class="cards">${cols.map(p => `<section class="card"><div class="colony-art">${planetCanvas(p)}<span class="pill">${esc(pack.planets[p.type].name.toUpperCase())}</span></div><div class="card-pad"><div class="row between"><h2>${esc(p.name)}</h2><small>${esc(state.systems[p.system].name)}</small></div><div class="metric-grid"><div><strong>${p.pop}M</strong><small>POPULATION</small></div><div><strong>${engine.production(state, p)}</strong><small>PRODUCTION</small></div><div><strong>${engine.defence(state, p)}</strong><small>DEFENCE</small></div></div><p class="muted" style="font-size:11px">${p.queue.length ? esc(p.queue[0].name) + ' · ' + Math.ceil((p.queue[0].work - p.queue[0].done) / engine.production(state, p)) + ' turn(s)' : 'Production queue idle'}</p>${progress(p.queue[0]?.done || 0, p.queue[0]?.work || 1)}<div class="row" style="margin-top:17px">${btn('Manage production', 'manage', `data-id="${p.id}"`, 'primary small')}${btn('Locate', 'locate', `data-id="${p.system}"`, 'quiet small')}</div></div></section>`).join('')}</div>`;
}
function manageColony(id) {
  const p = state.planets[id]; if (!p || p.owner !== 0) return;
  modal(esc(p.name), `<div class="row between"><p>${engine.production(state, p)} production per turn. Minerals are paid when an order is placed.</p><span class="pill">${p.queue.length} / 5 QUEUED</span></div><h3>Construction queue</h3><div class="production-list">${p.queue.map((q, i) => `<div class="production-item"><div><p>${esc(q.name)}</p><small>${q.done} / ${q.work} work · ${Math.ceil((q.work - q.done) / engine.production(state, p))} turn(s) once active</small>${progress(q.done, q.work)}</div>${btn('Cancel', 'cancel-build', `data-planet="${id}" data-index="${i}"`, 'small quiet')}</div>`).join('') || '<p>No construction orders. Choose a facility or ship below.</p>'}</div><h3>Planetary facilities</h3><div class="production-list">${Object.entries(pack.buildings).map(([key, b]) => `<div class="production-item"><div><p>${esc(b.name)} <small>${p.buildings[key]}/${pack.rules.facilityLimit}</small></p><small>${esc(b.desc)}</small></div>${btn(`+ ${b.cost} ◇`, 'build', `data-planet="${id}" data-kind="${key}" ${state.empires[0].minerals < b.cost || p.queue.length >= 5 || p.buildings[key] + p.queue.filter(q => q.kind === key).length >= pack.rules.facilityLimit ? 'disabled' : ''}`, 'small')}</div>`).join('')}</div><h3>Orbital shipyard</h3>${p.buildings.yard ? `<div class="production-list">${state.empires[0].designs.map(d => { const stats = engine.designStats(d); return `<div class="production-item"><div class="row" style="margin:0">${shipCanvas(d)}<div><p>${esc(d.name)}</p><small>${stats.attack} attack · ${stats.hp} hull · ${stats.work} work</small></div></div>${btn(`${stats.cost} ◇`, 'build-ship', `data-planet="${id}" data-design="${d.id}" ${state.empires[0].minerals < stats.cost || p.queue.length >= 5 ? 'disabled' : ''}`, 'small')}</div>`; }).join('')}</div>` : '<p>Construct an orbital shipyard to build and repair ships here.</p>'}`);
  $('#dialog').querySelectorAll('[data-ship]').forEach(c => { c.style.width = '45px'; c.style.height = '45px'; }); paintCanvases($('#dialog'));
}
function fleetsView() {
  return pageHead('NAVAL OPERATIONS', 'The expeditionary fleet', `${engine.fleets(state).length} ships · ${engine.income(state).upkeep} energy upkeep per turn`, btn('Design a ship', 'designer', '', 'primary')) + `<div class="cards">${engine.fleets(state).map(f => { const stats = engine.designStats(f.design); return `<section class="card"><div class="blueprint" style="min-height:190px">${shipCanvas(f.design)}<span class="bp-tag">${esc(pack.hulls[f.design.hull].name.toUpperCase())}</span></div><div class="card-pad"><h2>${esc(f.name)}</h2><p class="muted" style="font-size:12px;margin-top:7px">${esc(state.systems[f.system].name)} · ${f.path.length ? 'en route to ' + esc(state.systems[f.path.at(-1)].name) : 'holding position'}</p><div class="metric-grid"><div><strong>${f.hp}/${stats.hp}</strong><small>HULL</small></div><div><strong>${stats.attack}</strong><small>ATTACK</small></div><div><strong>${stats.speed}</strong><small>LANES / TURN</small></div></div><p class="muted" style="font-size:11px">${stats.roles.filter(r => !['engine', 'shield', 'weapon'].includes(r)).map(r => r.toUpperCase()).join(' · ') || 'COMBAT VESSEL'}</p><div class="row" style="margin-top:17px">${btn('Issue orders', 'fleet-on-map', `data-id="${f.id}"`, 'primary small')}${btn('Copy design', 'copy-design', `data-fleet="${f.id}"`, 'quiet small')}</div></div></section>`; }).join('') || '<div class="empty">Your fleet is empty. Build ships at an orbital shipyard.</div>'}</div>`;
}
function researchView() {
  const e = state.empires[0], sci = engine.income(state).science;
  return pageHead('SCIENCE DIRECTORATE', 'Ideas that move empires', `${number(e.science)} research banked · ${sci} research per turn · one active field`, '') + `<div class="cards">${Object.entries(pack.tech).map(([id, t]) => { const level = e.tech[id], cost = engine.techCost(level), done = level >= pack.rules.maxTech; return `<section class="card tech-card ${id === e.research ? 'active' : ''}">${icon(id === 'propulsion' ? 'fleets' : id === 'industry' ? 'designer' : 'research')}<span class="level">LEVEL ${roman(level)} / ${roman(pack.rules.maxTech)}</span><h2>${esc(t.name)}</h2><p>${esc(t.desc)}</p>${progress(done ? 1 : e.science, done ? 1 : cost)}<div class="row between" style="margin-top:10px"><small>${done ? 'FIELD MASTERED' : `${e.science} / ${cost} RESEARCH`}</small><small>${done ? '' : Math.max(1, Math.ceil((cost - e.science) / sci)) + ' TURN(S)'}</small></div>${btn(done ? 'Mastered' : id === e.research ? 'Researching' : 'Set research focus', 'research', `data-field="${id}" ${done || id === e.research ? 'disabled' : ''}`, id === e.research ? 'primary small' : 'small quiet')}</section>`; }).join('')}</div><div class="card card-pad" style="margin-top:20px"><p class="muted" style="font-size:12px">New component levels unlock in the ship designer. Ships keep the components fitted when they were built. Master every field to win by ascension.</p></div>`;
}
function ensureDesigner() { if (!designer || !pack.hulls[designer.hull]) designer = { ...structuredClone(state.empires[0].designs[0]), name: 'New expedition class' }; }
function designerView() {
  ensureDesigner(); const e = state.empires[0], stats = engine.designStats(designer), hull = pack.hulls[designer.hull]; let valid = true, reason = 'Ready to register';
  try { engine.checkDesign(designer, e.tech, 0); } catch (error) { valid = false; reason = error.message; }
  const availableHulls = Object.values(pack.hulls).filter(h => (h.faction === -1 || h.faction === 0) && h.level <= e.tech[h.tech]);
  return pageHead('NAVAL ARCHITECTURE', 'Design your advantage', 'Choose a hull. Fit components. Save a class. Build it at any orbital shipyard.', btn('Campaign workshop', 'mods', '', 'quiet')) +
  `<div class="split-view"><div class="card"><div class="blueprint">${shipCanvas(designer, 0, true)}<span class="bp-tag">${esc(hull.name.toUpperCase())} / SCHEMATIC 01</span></div><div class="designer-fields"><label>CLASS NAME<input id="design-name" maxlength="32" value="${esc(designer.name)}"></label><label>HULL FRAME<select id="design-hull">${availableHulls.map(h => `<option value="${h.id}" ${h.id === designer.hull ? 'selected' : ''}>${esc(h.name)} · ${h.slots} slots · ${h.hp} base hull</option>`).join('')}</select></label><div class="metric-grid"><div><strong>${stats.attack}</strong><small>ATTACK</small></div><div><strong>${stats.hp}</strong><small>HULL</small></div><div><strong>${stats.cost}</strong><small>MINERALS</small></div></div><div class="row between"><span class="mono ${stats.slots > hull.slots ? 'gold' : 'mint'}">${stats.slots} / ${hull.slots} SLOTS</span><small>${stats.speed} lane(s) per turn</small></div>${progress(stats.slots, hull.slots)}<div>${designer.parts.map((id, index) => `<div class="part-row"><span>${esc(pack.components[id].name)} <small> · ${pack.components[id].slots} slot(s)</small></span>${btn('−', 'remove-part', `data-index="${index}" aria-label="Remove ${esc(pack.components[id].name)}"`, 'quiet small')}</div>`).join('') || '<p class="muted">An empty frame. Install an engine to begin.</p>'}</div><small>${esc(reason)}</small>${btn('Register ship class', 'save-design', valid ? '' : 'disabled', 'primary')}</div></div><section class="card"><div class="card-head"><h3>COMPONENT CATALOGUE</h3><small>${Object.keys(pack.components).length} MODULES</small></div><div class="card-pad component-list">${Object.values(pack.components).map(c => { const locked = c.level > e.tech[c.tech]; return `<div class="production-item"><div><p>${esc(c.name)} ${locked ? '<span class="gold">⌑</span>' : ''}</p><small>${c.slots} slot(s) · ${c.cost} ◇ ${c.attack ? ' · +' + c.attack + ' ATK' : ''}${c.hp ? ' · +' + c.hp + ' HULL' : ''}</small><small style="display:block;margin-top:5px">${locked ? 'Requires ' + esc(pack.tech[c.tech].name) + ' ' + roman(c.level) : esc(c.description)}</small></div>${btn('+', 'add-part', `data-part="${c.id}" aria-label="Add ${esc(c.name)}" ${locked || stats.slots + c.slots > hull.slots ? 'disabled' : ''}`, 'small')}</div>`; }).join('')}</div></section></div><section class="card" style="margin-top:20px"><div class="card-head"><h3>REGISTERED CLASSES</h3><small>Click to copy and modify</small></div><div class="design-library">${e.designs.map(d => btn(`${shipCanvas(d)}${esc(d.name)}`, 'copy-design', `data-design="${d.id}"`, 'quiet')).join('')}</div></section>`;
}
function diplomacyView() {
  const e = state.empires[0];
  return pageHead('FOREIGN AFFAIRS', 'Voices in the void', 'Trade, coexist, or bring your fleets to bear. Contact begins through exploration.') + `<div class="cards">${pack.empires.filter(f => f.id !== 0).map(f => {
    const contact = e.contacts.includes(f.id), relation = state.relations[0][f.id], sample = state.empires[f.id].designs.find(d => engine.role(d, 'assault')) || state.empires[f.id].designs[0];
    return `<section class="card"><div class="diplomacy-art">${contact ? shipCanvas(sample, f.id) : '<span class="mono muted" style="font-size:45px">?</span>'}<div class="sigil" style="color:${f.color};background:${f.color}22">${contact ? '⌁' : '?'}</div></div><div class="card-pad"><div class="eyebrow" style="color:${f.color}">${contact ? esc(f.short) : 'UNIDENTIFIED SIGNAL'}</div><h2>${contact ? esc(f.name) : 'Unknown civilisation'}</h2><p class="muted" style="font-size:12px;margin:12px 0 20px">${contact ? esc(f.ethos) : 'Send scouts beyond the frontier to establish contact.'}</p>${contact ? `<span class="pill" style="color:${relation === 'war' ? 'var(--danger)' : f.color}">${state.empires[f.id].defeated ? 'DEFEATED' : relation.toUpperCase()}</span><div class="row wrap" style="margin-top:20px">${relation === 'neutral' ? btn(`Trade pact · ${pack.rules.tradeCost} ⚡`, 'diplomacy', `data-target="${f.id}" data-offer="trade"`, 'small') : ''}${relation === 'war' ? btn(`Peace accord · ${pack.rules.peaceCost} ⚡`, 'diplomacy', `data-target="${f.id}" data-offer="peace"`, 'small') : btn('Declare war', 'war-prompt', `data-target="${f.id}"`, 'danger small quiet')}</div>` : '<small>NO DIPLOMATIC CHANNEL</small>'}</div></section>`;
  }).join('')}</div><div class="card card-pad" style="margin-top:20px"><p class="muted" style="font-size:12px">Trade agreements provide +${pack.rules.tradeIncome} energy per turn to both empires. Peace accords are accepted for the stated energy cost. AI empires may declare war after their opening grace period; they honour trade pacts. Capture a planet with marine-equipped ships whose combined attack meets its defence, after clearing the defending fleet.</p></div>`;
}
function reportsView() {
  return pageHead('COMMAND ARCHIVE', 'The story of your empire', `${state.log.length} recent dispatches · ${state.battles.length} recorded engagements`, btn('Export save', 'export-save', '', 'quiet')) + `<section class="card">${state.log.map(l => `<article class="report ${l.kind}"><span class="turn-label">T${String(l.turn).padStart(3, '0')}</span><div><div class="eyebrow" style="font-size:8px;margin-bottom:5px">${l.kind.toUpperCase()}</div><p>${esc(l.text)}</p></div></article>`).join('')}</section>` + (state.battles.length ? `<h2 style="margin:25px 0 15px">Combat ledger</h2><div class="cards">${state.battles.map(b => `<section class="card card-pad"><div class="eyebrow">TURN ${b.turn}</div><h3>${esc(state.systems[b.system].name)}</h3><p class="muted" style="font-size:12px;margin-top:12px">${b.participants.map(id => esc(pack.empires[id].short) + ': ' + b.losses[id] + ' lost').join(' · ')}</p>${b.captured.map(t => `<p class="mint" style="font-size:12px">${esc(t)}</p>`).join('')}</section>`).join('')}</div>` : '');
}
function modsView() {
  return pageHead('CAMPAIGN WORKSHOP', 'Make the universe yours', 'Editable text. Original worlds. No account, server, or build step.', btn('Import .txt folder', 'import-mod', '', 'primary')) +
  `<div class="cards">${campaigns.map(c => `<section class="card mod-card"><div class="mod-swatch">${c.id === 'frontier' ? 'EXPEDITION / 01' : 'ALTERNATE REALITY / 02'}</div><div class="eyebrow">INSTALLED CAMPAIGN</div><h2>${esc(c.title)}</h2><p>${c.id === 'frontier' ? 'Thirty stars, three distinct ship families, ancient archives and an open frontier.' : 'A sixteen-system machine civilisation campaign. Six-colony victory, renamed worlds and a working custom turn event.'}</p><div class="row">${btn('Start campaign', 'campaign-prompt', `data-pack="${c.id}"`, 'primary small')}${btn('Resume', 'resume-pack', `data-pack="${c.id}"`, 'quiet small')}</div></section>`).join('')}</div>
  <section class="card card-pad" style="margin-top:20px"><div class="eyebrow">ACTIVE PACK / ${esc(pack.meta.id)} @ ${esc(pack.meta.version)}</div><h2>Every empire starts in a text file.</h2><p class="muted" style="font-size:12px;margin:12px 0 20px">Edit names, faction colours, ship silhouettes, component stats, starting ships, world types, starlanes, research, buildings and campaign rules. Text imports are data only. For new behaviours, register local source hooks using the included example.</p><div class="row wrap">${btn('Export campaign pack', 'export-pack', '', 'small')}${btn('Edit text files', 'edit-pack', '', 'small quiet')}<a href="MOD_GUIDE.md" target="_blank" rel="noopener">Modding guide ↗</a></div></section>
  <section class="card card-pad" style="margin-top:20px"><div class="eyebrow">FACTION SHIP ATLAS</div><div class="cards">${pack.empires.map(f => `<div><h3 style="color:${f.color}">${esc(f.name)}</h3><div class="design-library" style="padding:10px 0">${Object.values(pack.hulls).filter(h => h.faction === f.id || h.faction === -1).map(h => `<div style="text-align:center;min-width:100px">${shipCanvas({ hull: h.id }, f.id)}<small>${esc(h.name)}</small></div>`).join('')}</div></div>`).join('')}</div></section>`;
}
function help() {
  modal('Your field manual', `<p>A classic turn-based space 4X, inspired by Space Empires IV. Nothing advances until you end a turn.</p><div class="help-grid"><div><h3>01 · Explore</h3><p>In the galaxy view, select a ship, then a neighbouring star and <b>Plot course</b>. End your turn to travel. The route can cross surveyed systems and end at an unsurveyed frontier star. Survey arrays recover golden ancient archives.</p><h3>02 · Expand</h3><p>Bring a colony ark to an unclaimed world, then choose <b>Colonise</b>. This consumes the ark and costs ${pack.rules.colonizeMinerals} minerals + ${pack.rules.colonizeEnergy} energy. You can also colonise another planet in your starting system.</p></div><div><h3>03 · Develop</h3><p>Manage a colony to queue facilities or ships. A shipyard enables shipbuilding and repairs. Research unlocks components; create a new design to use them. Existing ships retain their installed parts.</p><h3>04 · Prevail</h3><p>Sign treaties or declare war after first contact. Combat resolves each turn. Marine ships can capture planets once defenders are gone and their combined attack meets planetary defence. At zero energy, fleet attack is halved.</p></div></div><h3>Victory conditions</h3><p>Found ${pack.rules.colonyTarget} colonies, research every field to level ${roman(pack.rules.maxTech)}, or eliminate the other empires. At turn ${pack.rules.turnLimit}, the highest score wins: 100 per colony, 25 per research level and 5 per surviving ship. Loss of all colonies and colony arks ends your campaign.</p><h3>Controls & saves</h3><p>Mouse and touch: select, then confirm an order. Keyboard: Tab through controls; Enter/Space activates a focused button. <b>E</b> ends a turn; <b>1–8</b> change command views; <b>?</b> opens this guide. Shortcuts are disabled in forms and dialogs. Standard gamepad: D-pad cycles visible stars, A selects, B clears the fleet selection. Held controls must return to neutral after focus loss.</p><p>Accepted orders autosave in this browser. Export a save before clearing site data. Each campaign content version has a separate save slot. Save files include their complete text pack. You can play offline after the first complete cache installation, or serve a downloaded checkout locally.</p><div class="row">${btn('Back to the frontier', 'close', '', 'primary')}${btn('Sound ' + (audio.enabled ? 'on' : 'off'), 'sound', '', 'quiet')}</div>`);
}
function newGameDialog(id = null) {
  const wanted = id || extension || 'custom';
  modal('Begin an expedition', `<p>Your current campaign is saved. Starting again in the same campaign slot replaces that slot; export it first if you want to keep both.</p><div class="stack" style="margin-top:20px"><label>CAMPAIGN<select id="new-pack">${campaigns.map(c => `<option value="${c.id}" ${c.id === wanted ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}${!extension ? `<option value="custom" ${wanted === 'custom' ? 'selected' : ''}>Current imported campaign</option>` : ''}</select></label><label>GALAXY SEED<input id="new-seed" type="number" min="0" max="4294967295" step="1" value="2401"></label><label>AI TEMPERAMENT<select id="new-difficulty"><option value="relaxed">Patient · longer opening peace</option><option value="standard" selected>Standard · a contested frontier</option><option value="veteran">Aggressive · earlier declarations of war</option></select></label></div><div class="row">${btn('Launch expedition', 'launch', '', 'primary')}${btn('Export current save', 'export-save', '', 'quiet')}</div>`);
}
function savesDialog() { modal('Campaign records', `<p>Campaigns autosave after every accepted order. Export a self-contained save to transfer your campaign or keep a backup.</p><div class="row wrap">${btn('Export save', 'export-save', '', 'primary')}${btn('Import save', 'import-save')}${btn('Save now', 'save-now')}</div><h3>Current record</h3><p>${esc(pack.meta.title)} · turn ${state.turn} · seed ${state.seed}<br>${engine.colonies(state).length} colonies · ${engine.fleets(state).length} ships</p>`); }

document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled || !state) return;
  try {
    if (button.dataset.view) { view = button.dataset.view; render(); audio.effect(); return; }
    const d = button.dataset;
    switch (d.action) {
      case 'close': closeDialog(); break;
      case 'end': act({ type: 'endTurn' }); break;
      case 'system': selected = Number(d.id); render(); break;
      case 'select-fleet': selectedFleet = selectedFleet === Number(d.id) ? null : Number(d.id); render(); break;
      case 'fleet-on-map': { selectedFleet = Number(d.id); selected = state.fleets.find(f => f.id === selectedFleet).system; view = 'galaxy'; render(); break; }
      case 'move': if (act({ type: 'move', fleet: selectedFleet, target: Number(d.target) })) toast('Course plotted. End the turn to engage warp.'); break;
      case 'hold': act({ type: 'hold', fleet: selectedFleet }); break;
      case 'colonize': act({ type: 'colonize', planet: Number(d.planet), fleet: Number(d.fleet) }); break;
      case 'manage': manageColony(Number(d.id)); break;
      case 'locate': selected = Number(d.id); view = 'galaxy'; render(); break;
      case 'build': act({ type: 'build', planet: Number(d.planet), kind: d.kind }); manageColony(Number(d.planet)); break;
      case 'build-ship': act({ type: 'build', planet: Number(d.planet), kind: 'ship', design: Number(d.design) }); manageColony(Number(d.planet)); break;
      case 'cancel-build': act({ type: 'cancel', planet: Number(d.planet), index: Number(d.index) }); manageColony(Number(d.planet)); break;
      case 'research': act({ type: 'research', field: d.field }); break;
      case 'designer': view = 'designer'; render(); break;
      case 'mods': view = 'mods'; render(); break;
      case 'add-part': designer.parts.push(d.part); render(); break;
      case 'remove-part': designer.parts.splice(Number(d.index), 1); render(); break;
      case 'copy-design': { const source = d.fleet ? state.fleets.find(f => f.id === Number(d.fleet)).design : state.empires[0].designs.find(x => x.id === Number(d.design)); designer = structuredClone(source); designer.name = (source.name + ' Mk II').slice(0, 32); view = 'designer'; render(); break; }
      case 'save-design': if (act({ type: 'design', design: designer })) toast('Class registered. Build it at an orbital shipyard.'); break;
      case 'diplomacy': act({ type: 'diplomacy', target: Number(d.target), offer: d.offer }); closeDialog(); break;
      case 'war-prompt': modal('Declare war?', `<p>This breaks any trade pact with ${esc(pack.empires[Number(d.target)].name)}. Fleets and planets become hostile when turns resolve.</p><div class="row">${btn('Declare war', 'diplomacy', `data-target="${d.target}" data-offer="war"`, 'danger')}${btn('Keep the peace', 'close', '', 'quiet')}</div>`); break;
      case 'map-mode': mapMode = d.mode; render(); break;
      case 'zoom-in': zoom = Math.min(1.4, zoom + .1); drawGalaxy(); break;
      case 'zoom-out': zoom = Math.max(.7, zoom - .1); drawGalaxy(); break;
      case 'zoom-reset': zoom = 1; drawGalaxy(); break;
      case 'help': help(); break;
      case 'sound': await audio.toggle(); render(); toast(audio.enabled ? 'Sound enabled · original procedural soundscape' : 'Sound muted'); break;
      case 'new': newGameDialog(); break;
      case 'campaign-prompt': newGameDialog(d.pack); break;
      case 'launch': { const seed = Number($('#new-seed').value), difficulty = $('#new-difficulty').value, id = $('#new-pack').value; if (!$('#new-seed').value.trim()) throw new Error('Enter a galaxy seed.'); const data = id === 'custom' ? { pack, hooks: {}, extension: null } : await registered(id); await activate(data.pack, data.hooks, data.extension, null, seed, difficulty); toast('Expedition launched. The frontier awaits.'); break; }
      case 'resume-pack': { const data = await registered(d.pack), hash = await fingerprint(data.pack.raw), key = `voidward.save.v1.${data.pack.meta.id}@${data.pack.meta.version}.${hash}.${data.extension}`; const text = localStorage.getItem(key); if (!text) throw new Error('No saved expedition for this campaign yet.'); await importSave(text); toast('Campaign resumed.'); break; }
      case 'saves': savesDialog(); break;
      case 'save-now': if (autoSave()) toast('Campaign saved in this browser.'); break;
      case 'export-save': download(`voidward-${pack.meta.id}-turn-${state.turn}.json`, JSON.stringify(saveEnvelope(), null, 2)); toast('Save exported.'); break;
      case 'import-save': $('#save-file').click(); break;
      case 'import-mod': $('#mod-files').click(); break;
      case 'export-pack': download(`${pack.meta.id}-campaign.json`, JSON.stringify({ kind: 'voidward.text-pack.v1', files: pack.raw }, null, 2)); toast('Portable text pack exported. The workshop can reopen it.'); break;
      case 'edit-pack': editPack(); break;
      case 'pack-apply': { editorFiles[$('#pack-file').value] = $('#pack-text').value; const candidate = parsePack(editorFiles); await activate(candidate, {}, null, null, state.seed); toast('Edited text campaign validated and started in its own save slot.'); break; }
      case 'pack-download-file': editorFiles[$('#pack-file').value] = $('#pack-text').value; download($('#pack-file').value, $('#pack-text').value, 'text/plain'); break;
      case 'import-pack-json': $('#pack-json').click(); break;
    }
  } catch (error) { toast(error.message, true); }
});
let editorFiles = null, editingFile = 'campaign.txt';
function editPack() {
  editorFiles = structuredClone(pack.raw); editingFile = 'campaign.txt';
  modal('Campaign text editor', `<p>Editing creates a data-only campaign with its own save slot. Local source hooks are not attached to text imports. Change the ID and version in campaign.txt before sharing.</p><div class="stack" style="margin-top:18px"><label>TEXT FILE<select id="pack-file">${PACK_FILES.map(n => `<option value="${n}.txt">${n}.txt</option>`).join('')}</select></label><label>CONTENTS<textarea id="pack-text" spellcheck="false">${esc(editorFiles[editingFile])}</textarea></label></div><div class="row wrap">${btn('Validate & start edited campaign', 'pack-apply', '', 'primary small')}${btn('Download this .txt', 'pack-download-file', '', 'small')}${btn('Open portable pack', 'import-pack-json', '', 'quiet small')}</div><input type="file" id="pack-json" accept=".json,application/json" hidden>`);
}
document.addEventListener('input', event => { if (event.target.id === 'design-name') designer.name = event.target.value; });
document.addEventListener('change', async event => {
  try {
    if (event.target.id === 'design-hull') { designer.hull = event.target.value; render(); }
    if (event.target.id === 'pack-file') { editorFiles[editingFile] = $('#pack-text').value; editingFile = event.target.value; $('#pack-text').value = editorFiles[editingFile]; }
    if (event.target.id === 'pack-json') { const file = event.target.files[0]; if (!file) return; if (file.size > 1000000) throw new Error('Pack exceeds 1 MB.'); const data = JSON.parse(await file.text()); if (data.kind !== 'voidward.text-pack.v1') throw new Error('Unknown campaign format.'); const parsed = parsePack(data.files); editorFiles = parsed.raw; editingFile = 'campaign.txt'; $('#pack-file').value = editingFile; $('#pack-text').value = editorFiles[editingFile]; toast('Text pack loaded into the editor. Validate & start to play.'); }
    if (event.target.id === 'save-file') { const file = event.target.files[0]; if (!file) return; if (file.size > 2000000) throw new Error('Save exceeds 2 MB.'); await importSave(await file.text()); toast('Save verified and restored.'); event.target.value = ''; }
    if (event.target.id === 'mod-files') { if (!event.target.files.length) return; const candidate = await loadDirectory(event.target.files); await activate(candidate, {}, null); toast(`Campaign loaded: ${candidate.meta.title}`); event.target.value = ''; }
  } catch (error) { event.target.value = ''; toast(error.message, true); }
});
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !state || $('#dialog').open || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'e') { event.preventDefault(); act({ type: 'endTurn' }); }
  if (event.key === '?') help();
  const index = Number(event.key) - 1; if (index >= 0 && index < 8) { view = ['galaxy', 'colonies', 'fleets', 'research', 'designer', 'diplomacy', 'reports', 'mods'][index]; render(); }
});
function pollGamepad() {
  if (!state || document.hidden || !document.hasFocus() || $('#dialog').open) return;
  gamepad.poll(); const B = globalThis.QsolInput.BUTTON;
  if (gamepad.pressed(B.EAST)) { selectedFleet = null; render(); }
  if (view !== 'galaxy') return;
  const ids = [...engine.visibleSystems(state)].sort((a, b) => a - b), current = ids.indexOf(selected);
  if (gamepad.pressed(B.RIGHT) || gamepad.pressed(B.DOWN)) { selected = ids[(current + 1) % ids.length]; render(); }
  if (gamepad.pressed(B.LEFT) || gamepad.pressed(B.UP)) { selected = ids[(current - 1 + ids.length) % ids.length]; render(); }
  if (gamepad.pressed(B.SOUTH)) { if (selectedFleet) act({ type: 'move', fleet: selectedFleet, target: selected }); else { selectedFleet = engine.fleets(state).find(f => f.system === selected)?.id || null; render(); } }
}
window.addEventListener('blur', () => { gamepad.reset(); audio.suspend(); });
window.addEventListener('focus', () => { gamepad.reset(); audio.resume(); });
document.addEventListener('visibilitychange', () => { gamepad.reset(); document.hidden ? audio.suspend() : audio.resume(); });
$('#dialog').addEventListener('close', () => gamepad.reset());
async function boot() {
  let restoreError = '';
  try { const key = localStorage.getItem('voidward.active.v1'), saved = key && localStorage.getItem(key); if (saved) { await importSave(saved); return; } }
  catch (error) { restoreError = `Previous save could not be restored: ${error.message}`; }
  const data = await registered('frontier'); await activate(data.pack, data.hooks, data.extension);
  if (restoreError) toast(restoreError, true);
}
boot().then(() => {
  gamepadTimer = setInterval(pollGamepad, 80);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(error => toast('Offline cache unavailable: ' + error.message, true));
}).catch(error => { $('#app').innerHTML = `<div class="loading"><h1>Unable to open the frontier</h1><p>${esc(error.message)}</p><p>Serve this folder over HTTP. See README.md for local play.</p><button onclick="location.reload()">Retry</button></div>`; });
// Read-only snapshots for diagnostics: external code cannot mutate the live campaign.
Object.defineProperty(globalThis, '__voidward', { get: () => state ? { state: structuredClone(state), pack: structuredClone(pack), view, selected, selectedFleet, audio: { enabled: audio.enabled, context: audio.effects.ctx?.state, cachedNotes: audio.notes.size }, engineVersion: 1 } : null });
