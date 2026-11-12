// SPDX-License-Identifier: Apache-2.0
import { parsePack, loadPack, loadDirectory, PACK_FILES, OPTIONAL_PACK_FILES } from './content.js';
import { createEngine } from './core.js';
import { encodeSaveEnvelope, decodeSaveEnvelope, MAX_SAVE_BYTES } from './save-codec.js';
import { drawMap, drawMinimap, mapProjection, chartTransform, paintPlanet, paintShip, paintRelic, backdropStats, spectralClass, MAP_MODES } from './render.js';
import { liveryCatalogue, liveryFor, compileLiveryPack, exportLiveryPack, LIVERY_PACK_BYTES } from './liveries.js';
import { commandReadiness, chartedSystems } from './command-tools.js';
import * as Workshop from './workshop.js';
import * as Bridge from './workbench-bridge.js';
import {HANDOFF_KEY,INCOMING_KEY} from './editor-workflow.js';
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
const player = () => state?.player ?? 0;
const gamepad = new globalThis.QsolInput.GamepadReader();
const packCache = new Map();
const filters = { colonies: { search: '', sort: 'name', mode: 'all' }, fleets: { search: '', sort: 'name', mode: 'all' }, reports: { search: '', sort: 'newest', mode: 'all' } };
const selectedShips = new Set();
let compareDesign = null, returnFocus = null, campaignLoadEpoch = 0;
let newCandidate = null, mapPan = { x: 0, y: 0 }, panMode = false, mapDrag = null, mapFrame = 0, lastRenderedView = null;
// Undo keeps references to earlier accepted states. act() never mutates the live
// state object (every order is applied to a structured clone), so a withdrawn
// order simply reinstates an already validated state. Ending a turn clears it.
let undoStack = [], importedLiveries = null, idleColonyCursor = -1;
const HISTORY_LIMIT = 24, THEMES = ['frontier', 'obsidian', 'ember', 'nebula'], DETAILS = ['full', 'lean'];
const ROLE_LABELS = { engine: 'DRIVE', weapon: 'ARMED', shield: 'SHIELDED', survey: 'SURVEY', colony: 'COLONY', assault: 'MARINES' };
function captureFocus(root = $('#app')) {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return null;
  return { id: el.id, data: { ...el.dataset }, tag: el.tagName, start: el.selectionStart, end: el.selectionEnd, scroll: window.scrollY };
}
function restoreFocus(info, root = $('#app')) {
  if (!info) return;
  let el = info.id ? document.getElementById(info.id) : null;
  if (!el && Object.keys(info.data).length) el = [...root.querySelectorAll(info.tag.toLowerCase())].find(x => Object.entries(info.data).every(([k,v]) => x.dataset[k] === v));
  el ||= root.id==='dialog' ? root.querySelector('button') : $('#main');
  if (el && !el.disabled) { el.focus({ preventScroll: true }); if (typeof el.setSelectionRange === 'function' && info.start !== null) { try { el.setSelectionRange(info.start, info.end); } catch {} } }
}
function playableOptions(candidate) {
  const allowed = candidate.scenario?.playable || [0];
  return candidate.empires.filter(e => allowed.includes(e.id)).map(e => `<option value="${e.id}">${esc(e.name)} · ${esc(e.ethos)}</option>`).join('');
}
function searchTools(kind, modes, sorts) {
  const f = filters[kind];
  return `<div class="list-tools"><label>Search ${kind}<input id="search-${kind}" type="search" data-filter="${kind}" data-key="search" value="${esc(f.search)}" placeholder="Name, system, role…"></label><label>Show<select data-filter="${kind}" data-key="mode">${modes.map(([id,label]) => `<option value="${id}" ${id === f.mode ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Sort<select data-filter="${kind}" data-key="sort">${sorts.map(([id,label]) => `<option value="${id}" ${id === f.sort ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>`;
}
function matching(text, query) { return text.toLocaleLowerCase().includes(query.toLocaleLowerCase()); }
function objectiveStrip() {
  const rows = engine.objectives(state), active = rows.filter(o => o.status === 'active'), complete = rows.filter(o => o.status === 'complete');
  if (!rows.length) return '';
  return `<section class="mission-strip" aria-label="Campaign progress"><div><div class="eyebrow">CAMPAIGN OPERATIONS · ${complete.length}/${rows.length} COMPLETE</div><strong>${esc(active[0]?.title || 'Review your campaign objectives')}</strong><p>${active[0] ? `${esc(active[0].description)} · ${active[0].current} / ${active[0].amount}` : 'Your discoveries and decisions are preserved with your save.'}</p></div>${btn('Objectives & choices', 'objectives', '', 'small')}</section>`;
}
function objectivesDialog() {
  const rows = engine.objectives(state);
  modal('Campaign operations', `<p>${esc(pack.meta.description)}</p><p class="muted">Objective victories open at turn ${pack.scenario?.minVictoryTurn || 1}. Conquest can win earlier if only one empire survives. Council deadline: turn ${pack.rules.turnLimit}. ${pack.scenario?.defeatAtLimit ? 'Failure to finish a victory route before the deadline ends this expedition.' : 'The council compares empire scores at the deadline.'}</p><div class="stack">${rows.map(o => `<section class="objective-card ${o.status}"><div class="row between"><h3>${esc(o.title)}</h3><span class="pill">${esc(o.status.toUpperCase())}${o.victory ? ' · VICTORY ROUTE' : ''}</span></div><p>${esc(o.description)}</p>${progress(o.current, o.amount)}<p class="mono">${o.current} / ${o.amount} · ${esc(o.kind)}${o.target && !['*', '-'].includes(o.target) ? ' · ' + esc(o.target) : ''}</p>${o.requires?.length ? `<small>Requires ${o.requires.map(id => esc(rows.find(x => x.id === id)?.title || id)).join(', ')}</small>` : ''}${o.branch && !o.chosen && o.status === 'active' ? `<p>Commit to the ${esc(o.branch)} route; other routes will close. This choice persists in this campaign.</p>${btn('Commit to this route', 'choose-objective', `data-id="${o.id}"`, 'small primary')}` : ''}</section>`).join('') || '<p>This campaign uses expansion, science, conquest and council score victories.</p>'}</div>`);
}
function settingsDialog() {
  const levels = audio.levels;
  modal('Sound & display', `<p>Original procedural music and effects. Your preferences stay on this device.</p><div class="stack"><label class="check-row"><input id="audio-enabled" type="checkbox" ${audio.enabled ? 'checked' : ''}>Enable sound</label><label>Music <output id="music-output">${Math.round(levels.music*100)}%</output><input id="music-volume" type="range" min="0" max="100" value="${Math.round(levels.music*100)}"></label><label>Effects <output id="effects-output">${Math.round(levels.effects*100)}%</output><input id="effects-volume" type="range" min="0" max="100" value="${Math.round(levels.effects*100)}"></label><label>Motion<select id="motion-setting"><option value="system">Follow system preference</option><option value="reduce">Reduce motion</option></select></label><label>Star labels<select id="label-setting"><option value="smart">Declutter crowded labels</option><option value="all">Show every charted name</option></select></label><label>Interface contrast<select id="contrast-setting"><option value="standard">Standard</option><option value="high">High contrast</option></select></label><label class="check-row"><input id="review-turn" type="checkbox" ${preferences.reviewTurn?'checked':''}>Review idle units before ending a turn</label><p>Music at zero keeps effects audible. Sound begins only after you enable it.</p><h3>Command deck appearance</h3><label>Interface theme<select id="theme-setting">${THEMES.map(t=>`<option value="${t}">${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}</select></label><label>Music arrangement<select id="music-mode"><option value="pack">Campaign score</option><option value="e8">E8 lattice variations (seeded)</option></select></label><label>Chart detail<select id="detail-setting"><option value="full">Full · nebula dust and grid</option><option value="lean">Lean · stars only</option></select></label><label class="check-row"><input id="minimap-setting" type="checkbox" ${preferences.minimap?'checked':''}>Show the chart overview minimap</label><h3>Fleet liveries</h3><p>Liveries recolour and pattern ship silhouettes. They never change hull polygons, designs, combat or saves, and each faction keeps its identifying colour.</p>${liverySettings()}<div class="row wrap">${btn('Import livery pack (.json)', 'livery-import', '', 'small')}${btn('Download editable template', 'livery-template', '', 'small quiet')}${btn('Reset liveries', 'livery-reset', '', 'small quiet')}</div><input id="livery-upload" type="file" accept=".json,application/json" hidden><p class="muted">${importedLiveries ? `Imported pack: ${esc(importedLiveries.title)} by ${esc(importedLiveries.author)} (${importedLiveries.liveries.length} liveries).` : 'No imported pack. Built-in hangar liveries are available to every faction.'}</p>${btn('New game', 'new', '', 'quiet')}${btn('Field manual', 'help', '', 'quiet')}</div>`);
  $('#motion-setting').value = preferences.motion;
  $('#label-setting').value = preferences.labels; $('#contrast-setting').value = preferences.contrast;
  $('#theme-setting').value = preferences.theme; $('#music-mode').value = preferences.musicMode; $('#detail-setting').value = preferences.detail;
  paintCanvases($('#dialog'));
}
const preferences = { music: .55, effects: .8, motion: 'system', labels: 'smart', contrast: 'standard', reviewTurn: false, theme: 'frontier', liveries: {}, minimap: true, musicMode: 'pack', detail: 'full' };
try { const saved = JSON.parse(localStorage.getItem('voidward.preferences.v1') || '{}'); for (const k of ['music','effects']) if (Number.isFinite(saved[k])) preferences[k] = Math.min(1, Math.max(0,saved[k])); if (saved.motion === 'reduce') preferences.motion = 'reduce'; if(saved.labels === 'all') preferences.labels = 'all'; if(saved.contrast === 'high') preferences.contrast = 'high'; if(saved.reviewTurn === true) preferences.reviewTurn = true; if (THEMES.includes(saved.theme)) preferences.theme = saved.theme; if (saved.minimap === false) preferences.minimap = false; if (saved.musicMode === 'e8') preferences.musicMode = 'e8'; if (DETAILS.includes(saved.detail)) preferences.detail = saved.detail; if (saved.liveries && typeof saved.liveries === 'object' && !Array.isArray(saved.liveries)) for (const [key, value] of Object.entries(saved.liveries).slice(0, 64)) if (/^[a-z][a-z0-9-]{0,39}\/[0-5]$/.test(key) && typeof value === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(value)) preferences.liveries[key] = value; } catch {}
try { const text = localStorage.getItem('voidward.liveries.v1'); if (text) importedLiveries = compileLiveryPack(text); } catch { try { localStorage.removeItem('voidward.liveries.v1'); } catch {} }
audio.setLevels(preferences.music, preferences.effects);
document.documentElement.dataset.motion = preferences.motion;
document.documentElement.dataset.contrast = preferences.contrast;
document.documentElement.dataset.theme = preferences.theme;
function savePreferences() { try { localStorage.setItem('voidward.preferences.v1', JSON.stringify(preferences)); } catch {} }
const liveryKey = (empire, source = pack) => `${source.meta.id}/${empire.id}`;
function playerLivery(empire = pack.empires[player()], source = pack) { return liveryFor(empire, source, preferences.liveries, importedLiveries); }
function liveryOptions(empire, source = pack) {
  const current = preferences.liveries[liveryKey(empire, source)] || 'auto', auto = liveryFor(empire, source, {}, importedLiveries);
  return `<option value="auto" ${current==='auto'?'selected':''}>Automatic · ${esc(auto.name)}</option>${liveryCatalogue(importedLiveries).map(l => `<option value="${esc(l.id)}" ${l.id===current?'selected':''}>${esc(l.name)}</option>`).join('')}`;
}
function liverySettings() {
  return `<div class="livery-grid">${pack.empires.map(e => `<div class="livery-row"><canvas data-ship="${esc(pack.hulls[pack.ships.find(s=>s.empire===e.id)?.hull]?.id || Object.keys(pack.hulls)[0])}" data-owner="${e.id}" role="img" aria-label="${esc(e.name)} livery preview"></canvas><label><span style="color:${e.color}">${esc(e.short)}</span><select data-livery="${e.id}" aria-label="${esc(e.name)} livery">${liveryOptions(e)}</select></label></div>`).join('')}</div>`;
}
function setLivery(empireId, id) {
  const key = liveryKey(pack.empires[empireId]);
  if (id === 'auto' || !liveryCatalogue(importedLiveries).some(l => l.id === id)) delete preferences.liveries[key]; else preferences.liveries[key] = id;
  savePreferences();
}
function coloniesView() {
  const all = engine.colonies(state), f = filters.colonies;
  const cols = all.filter(p => matching(`${p.name} ${state.systems[p.system].name} ${pack.planets[p.type].name}`,f.search) && (f.mode !== 'idle' || !p.queue.length) && (f.mode !== 'yards' || p.buildings.yard));
  cols.sort((a,b) => f.sort === 'production' ? engine.production(state,b)-engine.production(state,a) || a.id-b.id : f.sort === 'population' ? b.pop-a.pop || a.id-b.id : a.name.localeCompare(b.name));
  return pageHead('COLONIAL ADMINISTRATION', 'Your colony worlds', `${all.length} colonies · ${all.reduce((n,p)=>n+p.pop,0)} million citizens · ${all.filter(p=>!p.queue.length).length} idle queues`,btn('Field manual','help','','quiet')) + searchTools('colonies',[['all','All colonies'],['idle','Idle production'],['yards','Shipyards']],[['name','Name'],['production','Production'],['population','Population']]) + `<div class="table-scroll"><table class="command-table"><thead><tr><th>World / system</th><th>Population</th><th>Production</th><th>Defence</th><th>Queue</th><th>Commands</th></tr></thead><tbody>${cols.map(p=>`<tr><td><div class="world-cell">${planetCanvas(p)}<div><strong>${esc(p.name)}</strong><small>${esc(state.systems[p.system].name)} · ${esc(pack.planets[p.type].name)}</small></div></div></td><td>${p.pop}M / ${pack.planets[p.type].max}M${progress(p.pop,pack.planets[p.type].max)}</td><td>${engine.production(state,p)} / turn</td><td>${engine.defence(state,p)}</td><td>${p.queue.length ? `<strong>${esc(p.queue[0].name)}</strong><small>${Math.ceil((p.queue[0].work-p.queue[0].done)/engine.production(state,p))} turns · ${p.queue.length} queued</small>${progress(p.queue[0].done,p.queue[0].work)}` : '<span class="gold">Awaiting orders</span>'}</td><td><div class="row wrap">${btn('Manage production','manage',`data-id="${p.id}"`,'small primary')}${btn('Locate','locate',`data-id="${p.system}"`,'small quiet')}</div></td></tr>`).join('') || '<tr><td colspan="6">No matching colonies.</td></tr>'}</tbody></table></div>`;
}
function manageColony(id) {
  const p=state.planets[id]; if(!p || p.owner!==player()) return;
  let total=0;
  modal(esc(p.name),`<p>${engine.production(state,p)} production / turn · ${p.pop}M population · ${engine.defence(state,p)} defence. Orders pay minerals on admission. Reordering preserves paid costs and completed work.</p><h3>Construction queue · ${p.queue.length}/5</h3><div class="production-list">${p.queue.map((q,i)=>{total+=Math.ceil((q.work-q.done)/engine.production(state,p)); return `<div class="production-item"><div><strong>${i+1}. ${esc(q.name)}</strong><small>${q.done}/${q.work} work · completes in approximately ${total} turns</small>${progress(q.done,q.work)}</div><div class="row">${btn('↑','reorder',`data-planet="${id}" data-from="${i}" data-to="${i-1}" aria-label="Move ${esc(q.name)} up" ${i===0?'disabled':''}`,'small quiet')}${btn('↓','reorder',`data-planet="${id}" data-from="${i}" data-to="${i+1}" aria-label="Move ${esc(q.name)} down" ${i===p.queue.length-1?'disabled':''}`,'small quiet')}${btn('Cancel','cancel-build',`data-planet="${id}" data-index="${i}"`,'small quiet')}</div></div>`;}).join('') || '<p>Queue idle. Choose a facility or ship below.</p>'}</div><h3>Facilities</h3><div class="production-list">${Object.entries(pack.buildings).map(([key,b])=>`<div class="production-item"><div><strong>${esc(b.name)} · ${p.buildings[key]}/${pack.rules.facilityLimit}</strong><small>${esc(b.desc)} · ${Math.ceil(b.work/engine.production(state,p))} turns</small></div>${btn(`+ ${b.cost} ◇`,'build',`data-planet="${id}" data-kind="${key}" ${state.empires[player()].minerals<b.cost || p.queue.length>=5 || p.buildings[key]+p.queue.filter(q=>q.kind===key).length>=pack.rules.facilityLimit?'disabled':''}`,'small')}</div>`).join('')}</div><h3>Orbital shipyard</h3>${p.buildings.yard ? `<div class="production-list">${state.empires[player()].designs.map(d=>{const a=engine.designStats(d);return `<div class="production-item"><div class="world-cell">${shipCanvas(d)}<div><strong>${esc(d.name)}</strong><small>${a.attack} attack · ${a.hp} hull · ${Math.ceil(a.work/engine.production(state,p))} turns</small></div></div>${btn(`${a.cost} ◇`,'build-ship',`data-planet="${id}" data-design="${d.id}" ${state.empires[player()].minerals<a.cost || p.queue.length>=5?'disabled':''}`,'small')}</div>`;}).join('')}</div>` : '<p>Build a shipyard to construct and repair ships here.</p>'}`);
  paintCanvases($('#dialog'));
}
function fleetsView() {
  const all=engine.fleets(state),f=filters.fleets;
  const ships=all.filter(x=>matching(`${x.name} ${state.systems[x.system].name} ${engine.designStats(x.design).roles.join(' ')}`,f.search) && (f.mode!=='idle'||(!x.refit && !x.path.length && (!x.order || x.order.type==='hold'))) && (f.mode!=='damaged'||x.hp<engine.designStats(x.design).hp));
  ships.sort((a,b)=>f.sort==='system'?a.system-b.system || a.id-b.id:f.sort==='attack'?engine.designStats(b.design).attack-engine.designStats(a.design).attack || a.id-b.id:a.name.localeCompare(b.name));
  const groups=(state.groups||[]).filter(g=>g.owner===player());
  return pageHead('NAVAL OPERATIONS','The expeditionary fleet',`${all.length} ships · ${groups.length} task forces · ${engine.income(state).upkeep} energy upkeep / turn`,btn('Design a ship','designer','','primary')) + searchTools('fleets',[['all','All ships'],['idle','Awaiting orders'],['damaged','Damaged']],[['name','Name'],['system','System'],['attack','Attack']]) + `<div class="row wrap list-actions">${btn('Group selected ships','group-prompt',selectedShips.size<2?'disabled':'','small')}<small>${selectedShips.size} selected · ships must share a system. Groups travel at their slowest member's speed.</small></div>${groups.length ? `<div class="group-list">${groups.map(g=>`<section class="card card-pad"><div class="row between"><div><strong>${esc(g.name)}</strong><small>${g.ships.length} ships</small></div><div class="row">${btn('Set destination','group-orders',`data-group="${g.id}"`,'small primary')}${btn('Disband','ungroup',`data-group="${g.id}"`,'small quiet')}</div></div></section>`).join('')}</div>`:''}<div class="table-scroll"><table class="command-table"><thead><tr><th>Select</th><th>Ship / class</th><th>System / orders</th><th>Hull</th><th>Attack / speed</th><th>Commands</th></tr></thead><tbody>${ships.map(x=>{const a=engine.designStats(x.design),g=groups.find(g=>g.ships.includes(x.id));return `<tr><td><input type="checkbox" data-ship-select="${x.id}" aria-label="Select ${esc(x.name)} for grouping" ${selectedShips.has(x.id)?'checked':''}></td><td><div class="world-cell">${shipCanvas(x.design)}<div><strong>${esc(x.name)}</strong><small>${esc(pack.hulls[x.design.hull].name)}${g?' · '+esc(g.name):''}</small><span class="role-pills">${a.roles.filter(r=>r!=='engine').map(r=>`<i class="role-pill ${r}">${ROLE_LABELS[r]||esc(r)}</i>`).join('')}</span></div></div></td><td><strong>${esc(state.systems[x.system].name)}</strong><small>${x.path.length?'→ '+esc(state.systems[x.path.at(-1)].name):esc(x.refit ? 'refit '+x.refit.done+'/'+x.refit.work+' work' : x.order?.type || 'holding position')}</small></td><td>${x.hp}/${a.hp}${progress(x.hp,a.hp)}</td><td>${a.attack} ATK · ${a.speed} lanes</td><td><div class="row wrap">${btn('Issue orders','fleet-on-map',`data-id="${x.id}"`,'small primary')}${btn('Orders / refit','ship-orders',`data-id="${x.id}"`,'small')}${btn('Copy design','copy-design',`data-fleet="${x.id}"`,'small quiet')}</div></td></tr>`;}).join('')||'<tr><td colspan="6">No matching ships.</td></tr>'}</tbody></table></div>`;
}
function destinationOptions(from, patrol=false) { return [...engine.visibleSystems(state)].filter(id=>(!patrol || id!==from && state.empires[player()].known.includes(id)) && engine.route(state,from,id).length).map(id=>`<option value="${id}" ${id===selected?'selected':''}>${esc(state.systems[id].name)}</option>`).join(''); }
function courseCommand(target) { const group=state.groups.find(g=>g.owner===player()&&g.ships.includes(selectedFleet));return group?{type:'groupMove',group:group.id,target}:{type:'move',fleet:selectedFleet,target}; }
function shipOrders(id) {
  const f=state.fleets.find(x=>x.id===id && x.owner===player()); if(!f) return;
  const candidates=state.empires[player()].designs.filter(d=>d.hull===f.design.hull);
  modal(esc(f.name),`<p>${esc(state.systems[f.system].name)} · ${esc(f.order?.type || 'hold')}. Refit requires the same hull, an owned shipyard, no hostile ships and no task-force membership. The ship stays vulnerable while work completes.</p><div class="row wrap">${[['hold','Hold position'],['explore','Auto-explore'],['return','Return to shipyard']].map(([order,label])=>btn(label,'ship-order',`data-fleet="${id}" data-order="${order}"`,'small')).join('')}</div><h3>Patrol route</h3><label>TURNAROUND SYSTEM<select id="order-target">${destinationOptions(f.system,true)}</select></label>${btn('Patrol between here and target','ship-order',`data-fleet="${id}" data-order="patrol"`,'small')}<h3>Refit quotations</h3><div class="production-list">${candidates.map(d=>{let quote,reason;try{quote=engine.refitQuote(state,id,d.id);}catch(e){reason=e.message;}const a=engine.designStats(d);return `<div class="production-item"><div><strong>${esc(d.name)}</strong><small>${a.attack} attack · ${a.hp} hull · ${a.speed} lanes</small><small>${quote?`${quote.cost} minerals · ${quote.turns} turns · ${quote.work} work`:esc(reason)}</small></div>${btn('Refit','refit',`data-fleet="${id}" data-design="${d.id}" ${!quote || quote.cost>state.empires[player()].minerals?'disabled':''}`,'small')}</div>`;}).join('')}</div>`);
}
function researchView() {
  const e=state.empires[player()],sci=engine.income(state).science;
  return pageHead('SCIENCE DIRECTORATE','Ideas that move empires',`${number(e.science)} research banked · ${sci} / turn · one active field`) + `<div class="cards">${Object.entries(pack.tech).map(([id,t])=>{const level=e.tech[id],cost=engine.techCost(level),done=level>=pack.rules.maxTech, available=engine.researchAvailable(state,id),unlocks=engine.unlocks(id,level+1); const items=[...unlocks.hulls.filter(h=>h.faction<0||h.faction===player()),...unlocks.components];return `<section class="card tech-card ${id===e.research?'active':''}"><span class="level">${roman(level)} / ${roman(pack.rules.maxTech)}</span>${icon('research')}<h2>${esc(t.name)}</h2><p>${esc(t.desc)}</p>${progress(done?1:e.science,done?1:cost)}<div class="row between"><small>${done?'FIELD MASTERED':`${e.science}/${cost} research`}</small><small>${done?'':sci>0?Math.max(1,Math.ceil((cost-e.science)/sci))+' turns':'No research income'}</small></div>${available.requirements?.length?`<p class="requirements">Requires ${available.requirements.map(r=>`${esc(pack.tech[r.field].name)} ${roman(r.level)} (${roman(r.current)})`).join(', ')}</p>`:''}<div class="unlock-list"><strong>Next level unlocks</strong>${items.length?items.map(x=>`<span>${esc(x.name)} · ${x.slots} slots${x.attack?' · '+x.attack+' ATK':''}</span>`).join(''):'<span>Improved empire capability; no new ship modules at this level.</span>'}</div>${btn(done?'Mastered':id===e.research?'Researching':'Set research focus','research',`data-field="${id}" ${done||id===e.research||!available.available?'disabled':''} title="${esc(available.reason||'Allocate science to this field')}"`,id===e.research?'primary small':'small quiet')}</section>`;}).join('')}</div>`;
}
function designerView() {
  const base=baseDesignerView(),designs=state.empires[player()].designs;
  const comparison=designs.find(d=>d.id===Number(compareDesign)) || designs[0], a=engine.designStats(designer),b=engine.designStats(comparison);
  return base+`<section class="card card-pad design-comparison"><div class="row between"><h2>Compare designs</h2><label>REFERENCE CLASS<select id="compare-design">${designs.map(d=>`<option value="${d.id}" ${d.id===comparison.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label></div><div class="comparison-grid">${[['attack','Attack'],['hp','Hull'],['speed','Speed'],['cost','Minerals'],['slots','Slots']].map(([key,label])=>`<div><small>${label}</small><strong>${a[key]}</strong><span class="${a[key]===b[key]?'muted':'mint'}">${plus(a[key]-b[key])} vs ${b[key]}</span></div>`).join('')}</div>${btn('Update reference template','update-design',`data-design="${comparison.id}"`,'small')}<p class="muted">Registered classes are reusable templates. Built ships and queued orders retain their installed parts. Refit through Fleets → Orders / refit; same-hull upgrades require an owned shipyard and explicit mineral payment.</p></section>`;
}
function diplomacyView() {
  const summaries=state.empires[player()].contacts.map(id=>{
    const reports=state.empires[player()].known.map(s=>engine.systemIntel(state,s)).filter(Boolean);
    const occupied=reports.filter(r=>r.planets.some(p=>p.owner===id));
    const forces=reports.filter(r=>r.fleets.some(f=>f.owner===id));
    return `<section class="card card-pad"><h3 style="color:${pack.empires[id].color}">${esc(pack.empires[id].short)} intelligence</h3><p class="muted">${occupied.length} systems with reported colonies · ${forces.length} fleet sightings. Reports reflect your sensors and last visit.</p>${occupied.slice(0,8).map(r=>`<p>${esc(state.systems[r.system].name)} · ${r.current?'current sensor coverage':'last seen turn '+r.turn}</p>`).join('') || '<p>No charted colonies.</p>'}</section>`;
  });
  return baseDiplomacyView()+`<h2 class="section-heading">Intelligence brief</h2><div class="cards">${summaries.join('')||'<p>No diplomatic contacts yet. Send scouts to establish channels.</p>'}</div>`;
}
function reportsView() {
  const f=filters.reports;
  const logs=state.log.filter(l=>matching(l.text,f.search)&&(f.mode==='all'||l.kind===f.mode));if(f.sort==='oldest')logs.reverse();
  const rawReport=state.reports?.[0];const report=rawReport?{...rawReport,completed:rawReport.completed.filter(x=>x.owner===player())}:null;
  return pageHead('COMMAND ARCHIVE','The story of your empire',`${state.log.length} recent dispatches · ${state.battles.length} engagements`,btn('Export save','export-save','','quiet')) + (report?`<section class="card card-pad turn-summary"><h2>Turn ${report.turn} summary</h2><div class="row wrap"><span>${report.completed.length} completed orders</span><span>${report.discovered.filter(x=>x.owner===player()).length} discoveries</span><span>${report.battles} engagements</span></div><p>${esc(report.completed.map(x=>typeof x==='string'?x:x.name||x.text||'Construction complete').join(' · '))}</p></section>`:'') + searchTools('reports',[['all','All dispatches'],...new Set(state.log.map(l=>l.kind))].map(x=>Array.isArray(x)?x:[x,x[0].toUpperCase()+x.slice(1)]),[['newest','Newest first'],['oldest','Oldest first']]) + `<section class="card">${logs.map(l=>`<article class="report ${l.kind}"><span class="turn-label">T${String(l.turn).padStart(3,'0')}</span><div><div class="eyebrow">${esc(l.kind.toUpperCase())}</div><p>${esc(l.text)}</p></div></article>`).join('') || '<p class="empty">No matching dispatches.</p>'}</section>${state.battles.length?`<h2 class="section-heading">Combat ledger</h2><div class="cards">${state.battles.map(b=>`<section class="card card-pad"><div class="eyebrow">TURN ${b.turn}</div><h3>${esc(state.systems[b.system].name)}</h3><p class="muted">${b.damage} damage exchanged · ${b.forces.map(f=>esc(pack.empires[f.owner].short)+': '+f.ships+' ships / '+f.attack+' effective attack').join(' · ')}</p>${b.participants.map(id=>`<p>${esc(pack.empires[id].short)} · <strong>${b.losses[id]} ships lost</strong></p>`).join('')}${b.captured.map(t=>`<p class="mint">${esc(t)}</p>`).join('')}${engine.visibleSystems(state).has(b.system)?btn('Locate battle','locate',`data-id="${b.system}"`,'small quiet'):''}</section>`).join('')}</div>`:''}`;
}

let workshopTab='map', workshopTable='empires', workshopRow=0, workshopSystem=0, workshopHull=null, hullDraft=null;
let bridgeText=null, bridgeResult=null, bridgeEntity=null;
const allPackFiles=()=>[...PACK_FILES,...OPTIONAL_PACK_FILES];
function openWorkshop(source=pack) { editorFiles=structuredClone(source.raw); workshopHull=Object.keys(source.hulls)[0];workshopSystem=0;workshopTab='map';hullDraft=null;bridgeText=null;bridgeResult=null;bridgeEntity=null;showWorkshop(); }
function draftPack() { return parsePack(editorFiles); }
function workshopMapMarkup(p) {
  const positions=p.map.map(s=>p.layout.find(x=>x.id===s.id)||{id:s.id,x:90+(s.id%p.rules.columns)*166,y:90+Math.floor(s.id/p.rules.columns)*156});
  const xs=positions.map(s=>s.x),ys=positions.map(s=>s.y), minX=Math.min(...xs), minY=Math.min(...ys),dx=Math.max(100,Math.max(...xs)-minX),dy=Math.max(100,Math.max(...ys)-minY);
  const at=id=>({x:8+(positions[id].x-minX)/dx*84,y:10+(positions[id].y-minY)/dy*80});
  const s=positions[workshopSystem],home=p.empires.find(e=>e.home===s.id);
  return `<div class="workshop-map"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${p.map.flatMap(a=>a.links.filter(n=>n>a.id).map(n=>`<line x1="${at(a.id).x}" y1="${at(a.id).y}" x2="${at(n).x}" y2="${at(n).y}" stroke="#476277" stroke-width=".35"/>`)).join('')}</svg>${p.map.map(a=>btn(String(a.id),'workshop-star',`data-id="${a.id}" aria-label="Edit system ${esc(p.systemNames[a.id])}" title="${esc(p.systemNames[a.id])}" style="left:${at(a.id).x}%;top:${at(a.id).y}%"`,a.id===workshopSystem?'active':'')).join('')}</div><p class="workshop-hint">Select a star to edit coordinates, two-way starlanes or an empire starting position. All changes are validated before the draft is replaced.</p><div class="workshop-fields"><label>SYSTEM ${s.id} · NAME<input id="workshop-system-name" value="${esc(p.systemNames[s.id])}" maxlength="60"></label><label>ARCHIVE<select id="workshop-relic"><option value="0" ${!p.map[s.id].relic?'selected':''}>None</option><option value="1" ${p.map[s.id].relic?'selected':''}>Ancient archive</option></select></label><label>CHART X<input id="workshop-x" type="number" min="-2000" max="2000" value="${s.x}"></label><label>CHART Y<input id="workshop-y" type="number" min="-2000" max="2000" value="${s.y}"></label></div><div class="row wrap">${btn('Apply system','workshop-system-save','','small primary')}</div><div class="workshop-fields"><label>STARLANE TARGET<select id="workshop-link">${p.map.filter(a=>a.id!==s.id).map(a=>`<option value="${a.id}">${a.id} · ${esc(p.systemNames[a.id])}${p.map[s.id].links.includes(a.id)?' · connected':''}</option>`).join('')}</select></label><label>EMPIRE HOME<select id="workshop-home">${p.empires.map(e=>`<option value="${e.id}">${esc(e.name)} · currently ${e.home}</option>`).join('')}</select></label></div><div class="row wrap">${btn('Connect lane','workshop-lane','data-enable="true"','small')}${btn('Remove lane','workshop-lane','data-enable="false"','small')}${btn('Set selected empire home here','workshop-home','','small')}</div><small>${home?'Current home of '+esc(home.name):'No empire begins here.'} Disconnecting the galaxy or overlapping homes is rejected.</small><div class="row wrap"><small>Workbench exchange uses X/Z at half chart scale (2 chart units = 1 Workbench unit); lanes, homes and objectives stay in this pack.</small>${btn('Export map to Workbench','workbench-map-export','','small quiet')}${btn('Import Workbench layout','workbench-map-import','','small quiet')}</div>`;
}
function workshopHullMarkup(p) {
  if(!p.hulls[workshopHull])workshopHull=Object.keys(p.hulls)[0];
  const h=p.hulls[workshopHull];hullDraft??=structuredClone(h.shape);
  return `<label>SHIP FAMILY / HULL<select id="workshop-hull">${Object.values(p.hulls).map(h=>`<option value="${h.id}" ${h.id===workshopHull?'selected':''}>${esc(h.name)} · ${h.faction<0?'shared':esc(p.empires[h.faction].short)}</option>`).join('')}</select></label><div class="workshop-grid"><div><canvas id="workshop-hull-canvas" class="workshop-preview" width="360" height="300" aria-label="Hull polygon preview; click to add a vertex"></canvas><p class="workshop-hint">Click the canvas to append a vertex. The nose points up. Keyboard editing: enter X and Y below, then Add vertex. Use 3–40 points within −60…60.</p><div class="workshop-fields"><label>VERTEX X<input id="vertex-x" type="number" min="-60" max="60" value="0"></label><label>VERTEX Y<input id="vertex-y" type="number" min="-60" max="60" value="-40"></label></div><div class="row wrap">${btn('Add vertex','hull-add','','small')}${btn('Undo vertex','hull-undo','','small')}${btn('Clear points','hull-clear','','small quiet')}${btn('Restore saved shape','hull-reset','','small quiet')}</div><div class="hull-points">${esc(hullDraft.map(p=>p.join(',')).join(';'))}</div>${btn('Apply hull geometry','hull-apply','','primary small')}</div><div><canvas data-workshop-ship="${h.id}" width="180" height="180" class="workshop-preview" aria-label="Rendered ship family preview"></canvas><p class="workshop-hint">Edit hull statistics, faction, technology and component catalogues in Records. Starting fleets are rows in ships.txt.</p><div class="row wrap">${btn('Import Workbench hull','workbench-hull-import','','small')}${btn('Export hull to Workbench','workbench-hull-export','','small quiet')}${btn('Export hull + attribution','workbench-bundle-export','','small quiet')}</div>${bridgeText?`<label>WORKBENCH ENTITY<select id="workbench-entity">${Bridge.inspectWorkbench(bridgeText).map(e=>`<option value="${esc(e.id)}" ${e.id===bridgeEntity?'selected':''}>${esc(e.name)} · ${esc(e.mesh)}</option>`).join('')}</select></label>${btn('Preview projection','workbench-preview','','small')}`:''}${bridgeResult?`<p class="workshop-hint">${bridgeResult.warnings.map(esc).join(' ')} ${bridgeResult.shareable?'Declared licence permits sharing under its terms.':'Owner-local asset: resolve its licence before sharing.'}</p>${btn('Apply projected hull','workbench-apply','','small primary')}`:''}</div></div>`;
}
function workshopRecordsMarkup(p) {
  const rows=Workshop.readRows(editorFiles,workshopTable),fields=Workshop.TABLE_FIELDS[workshopTable],row=rows[workshopRow] || {};
  return `<div class="workshop-select"><label>DATA TABLE<select id="workshop-table">${Object.keys(Workshop.TABLE_FIELDS).map(n=>`<option value="${n}" ${n===workshopTable?'selected':''}>${n}.txt</option>`).join('')}</select></label><label>RECORD<select id="workshop-row">${rows.map((r,i)=>`<option value="${i}" ${i===workshopRow?'selected':''}>${i+1} · ${esc(r.name||r.title||r.id||r.empire||r.field||r.note)}</option>`).join('')}<option value="${rows.length}" ${workshopRow>=rows.length?'selected':''}>+ New record</option></select></label></div><div class="workshop-fields">${fields.map(key=>`<label class="${['description','shape','parts','requires','links'].includes(key)?'wide':''}">${esc(key.toUpperCase())}<input data-workshop-field="${key}" value="${esc(row[key]||'')}" aria-label="${esc(workshopTable+'.'+key)}"></label>`).join('')}</div><div class="row wrap">${btn('Apply record','workshop-record-save','','primary small')}${btn('Remove record','workshop-record-delete',workshopRow>=rows.length?'disabled':'','quiet small')}</div><p class="workshop-hint">Every field maps directly to the documented .txt column. Objective kinds: colonies, survey, archives, research, trade, control, survive, defeat, resources. Events: resources, spawn, message, war. Set objective branch IDs to offer persistent player choices. Invalid references and prerequisites are rejected.</p>`;
}
function showWorkshop() {
  const result=Workshop.diagnosePack(editorFiles); const p=result.pack;
  modal('Visual campaign workshop',`<p>Create an independent text pack, preview its contents, export it, then reimport and launch. Your active expedition is unchanged until you launch.</p>${p?`<div class="workshop-summary">${esc(p.meta.title)} · ${p.map.length} stars · ${p.empires.length} empires · ${Object.keys(p.hulls).length} hulls · ${p.objectives.length} objectives</div>`:''}<div class="workshop-tabs">${[['map','Galaxy'],['hulls','Ship families'],['records','Records'],['settings','Scenario & rules'],['text','Text files']].map(([id,name])=>btn(name,'workshop-tab',`data-tab="${id}"`,workshopTab===id?'active':'')).join('')}</div><div id="workshop-error" role="status"></div>${!p?`<pre class="diagnostics">${result.diagnostics.map(d=>esc(d.message)).join('\n')}</pre>`:workshopTab==='map'?workshopMapMarkup(p):workshopTab==='hulls'?workshopHullMarkup(p):workshopTab==='records'?workshopRecordsMarkup(p):workshopTab==='settings'?`<div class="workshop-fields"><label>CAMPAIGN ID<input id="workshop-id" value="${esc(p.meta.id)}"></label><label>VERSION<input id="workshop-version" value="${esc(p.meta.version)}"></label><label class="wide">TITLE<input id="workshop-title" value="${esc(p.meta.title)}"></label><label class="wide">DESCRIPTION<input id="workshop-description" value="${esc(p.meta.description)}"></label><label>PLAYABLE EMPIRES<input id="workshop-playable" value="${p.scenario.playable.join(',')}"></label><label>VICTORY<select id="workshop-victory"><option value="legacy" ${p.scenario.victory==='legacy'?'selected':''}>Expansion / science / conquest</option><option value="objectives" ${p.scenario.victory==='objectives'?'selected':''}>Scenario objectives</option></select></label><label>EARLIEST OBJECTIVE VICTORY TURN<input id="workshop-min-turn" type="number" min="1" value="${p.scenario.minVictoryTurn}"></label><label>DEFEAT AT DEADLINE<select id="workshop-deadline"><option value="0">Council scores</option><option value="1" ${p.scenario.defeatAtLimit?'selected':''}>Defeat if no victory route completed</option></select></label></div><div class="row">${btn('Apply scenario','workshop-settings-save','','primary small')}</div><p class="workshop-hint">Economy and AI settings remain editable in rules.txt and ai.txt. Define objectives in Records before selecting objective victory.</p>`:`<div class="stack"><label>FILE<select id="visual-pack-file">${allPackFiles().map(f=>`<option value="${f}.txt" ${editingFile===f+'.txt'?'selected':''}>${f}.txt</option>`).join('')}</select></label><label>TEXT<textarea id="visual-pack-text" spellcheck="false">${esc(editorFiles[editingFile]||'')}</textarea></label></div><div class="row">${btn('Validate text change','workshop-text-save','','primary small')}${btn('Download this .txt','workshop-download-text','','small')}</div>`}<div class="workshop-actions">${btn('Validate & preview','workshop-validate','','small')}${btn('Export draft pack','workshop-export','','primary small')}${btn('Export Mod SDK exchange','workshop-sdk-export','','small')}${btn('Open portable pack','workshop-import','','small')}${btn('Create new galaxy','workshop-create','','small')}${btn('Launch draft campaign','workshop-launch','','small')}${btn('Open in 3D Workbench','visual-editor-draft','','small')}</div><input id="workshop-upload" type="file" accept=".json" hidden><input id="workbench-upload" type="file" accept=".json" hidden>`);
  if(p && workshopTab==='hulls')paintHullEditor(p);
}
function paintHullEditor(p=draftPack()) {
  const canvas=$('#workshop-hull-canvas');if(!canvas)return;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(2,2);
  ctx.strokeStyle='#263c50';ctx.lineWidth=.5;for(let i=-60;i<=60;i+=10){ctx.beginPath();ctx.moveTo(i,-65);ctx.lineTo(i,65);ctx.moveTo(-65,i);ctx.lineTo(65,i);ctx.stroke();}
  if(hullDraft.length){ctx.beginPath();hullDraft.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle='#385d6480';ctx.fill();ctx.strokeStyle='#72dbc4';ctx.lineWidth=1;ctx.stroke();hullDraft.forEach(([x,y],i)=>{ctx.fillStyle='#e6bb7e';ctx.fillRect(x-1.5,y-1.5,3,3);ctx.font='5px monospace';ctx.fillText(String(i+1),x+3,y);});}ctx.restore();
  const hull={...p.hulls[workshopHull],shape:hullDraft};const empire=p.empires[Math.max(0,hull.faction)];paintShip($('[data-workshop-ship]'),hull,empire,false,{livery:liveryFor(empire,p,preferences.liveries,importedLiveries)});
}
function workshopFailure(error) { const box=$('#workshop-error');if(box){box.className='diagnostics';box.textContent=error.message;}else toast(error.message,true); }
function createWorkshopDialog() {
  const p=draftPack();modal('Create a campaign',`<p>Start from this draft’s empires and rules. The generator produces a connected map, names and editable coordinates. Referenced objectives and events must still fit the chosen size.</p><div class="workshop-fields"><label>ID<input id="create-id" value="my-frontier"></label><label>TITLE<input id="create-title" value="My Frontier"></label><label>COLUMNS<input id="create-columns" type="number" value="${p.rules.columns}" min="2" max="8"></label><label>ROWS<input id="create-rows" type="number" value="${p.rules.rows}" min="2" max="8"></label><label>GEOGRAPHY<select id="create-geography"><option value="grid">Connected lattice</option><option value="ring">Ring</option><option value="chain">Long corridor</option></select></label><label>HOME SYSTEMS<input id="create-homes" value="${p.empires.map(e=>e.home).join(',')}"></label></div><div class="row">${btn('Generate campaign','workshop-generate','','primary')}</div>`);
}

async function registered(id) {
  const spec = campaigns.find(c => c.id === id); if (!spec) throw new Error('Unknown installed campaign.');
  if (!packCache.has(id)) packCache.set(id, await loadPack(spec.base, spec.files || []));
  return { pack: packCache.get(id), hooks: spec.hooks, extension: id };
}
async function fingerprint(raw) {
  const bytes = new TextEncoder().encode(JSON.stringify([...PACK_FILES.map(f => raw[f + '.txt']), ...OPTIONAL_PACK_FILES.filter(f => Object.hasOwn(raw, f + '.txt')).map(f => [f, raw[f + '.txt']])]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `toast visible${error ? ' error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), error ? 6500 : 3700); }
function closeDialog() { campaignLoadEpoch++; newCandidate=null; $('#dialog').close(); }
function modal(title, body) { campaignLoadEpoch++;newCandidate=null;const dialog=$('#dialog'),focus=dialog.open?captureFocus(dialog):null,scroll=dialog.open?dialog.scrollTop:0; if (!dialog.open) returnFocus = captureFocus(); dialog.innerHTML = `<div class="dialog-head"><h2>${title}</h2>${btn('✕', 'close', 'aria-label="Close dialog"', 'quiet small')}</div><div class="dialog-body">${body}</div>`; if (!dialog.open) dialog.showModal(); else { restoreFocus(focus,dialog); dialog.scrollTop=scroll; } }
function saveEnvelope() { return { kind: 'voidward.save.v1', extension, pack: pack.raw, state }; }
function autoSave() {
  try { localStorage.setItem(activeKey, encodeSaveEnvelope(saveEnvelope())); localStorage.setItem('voidward.active.v1', activeKey); return true; }
  catch { toast('Browser storage unavailable or full. Export your save to keep this campaign.', true); return false; }
}
async function activate(candidatePack, hooks, source, saved = null, seed = 2401, difficulty = 'standard', playerId = candidatePack.scenario.playable[0]) {
  const candidateEngine = createEngine(candidatePack, hooks), candidateState = saved ? candidateEngine.migrateState(saved) : candidateEngine.createGame(seed, difficulty, true, playerId);
  candidateEngine.validateState(candidateState);
  const hash = await fingerprint(candidatePack.raw);
  pack = candidatePack; engine = candidateEngine; state = candidateState; extension = source;
  activeKey = `voidward.save.v1.${pack.meta.id}@${pack.meta.version}.${hash}.${source || 'text'}${state.player ? '.empire-' + state.player : ''}`;
  selected = pack.empires[player()].home; selectedFleet = null; designer = null; selectedShips.clear(); compareDesign = null; view = 'galaxy'; zoom = 1; mapPan = { x: 0, y: 0 }; panMode = false;
  undoStack = []; idleColonyCursor = -1; audio.setScore(pack.music, { mode: preferences.musicMode, seed: state.seed }); audio.resume(); autoSave(); closeDialog(); render();
}
async function importSave(text) {
  const data = decodeSaveEnvelope(text);
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
    const previous = state, candidate = structuredClone(state);
    action.type === 'endTurn' ? engine.endTurn(candidate) : engine.command(candidate, action, player());
    engine.validateState(candidate); state = candidate;
    if (action.type === 'endTurn') undoStack = []; else { undoStack.push(previous); if (undoStack.length > HISTORY_LIMIT) undoStack.shift(); }
    autoSave();
    if (selectedFleet && !state.fleets.some(f => f.id === selectedFleet)) selectedFleet = null;
    for (const id of selectedShips) if (!state.fleets.some(f=>f.id===id&&f.owner===player())) selectedShips.delete(id);
    if (action.type === 'endTurn') toast(`Turn ${state.turn}: ${state.log.filter(l=>l.turn===state.turn).length} dispatches. Review Turn reports for details.`);
    audio.effect(action.type === 'endTurn' ? (state.battles[0]?.turn === state.turn ? 'alert' : 'order') : action.type === 'colonize' ? 'bank' : 'select');
    render(); return true;
  } catch (error) { toast(error.message, true); return false; }
}
function undoOrder() {
  if (state.winner !== null || !undoStack.length) { toast('Nothing to withdraw this turn.'); return; }
  const previous = undoStack.pop();
  try { engine.validateState(previous); } catch (error) { undoStack = []; toast('Undo record rejected: ' + error.message, true); return; }
  state = previous;
  if (selectedFleet && !state.fleets.some(f => f.id === selectedFleet)) selectedFleet = null;
  for (const id of selectedShips) if (!state.fleets.some(f=>f.id===id&&f.owner===player())) selectedShips.delete(id);
  autoSave(); audio.effect('select'); closeDialog(); render(); toast(`Order withdrawn · ${undoStack.length} more this turn.`);
}
function nextIdleColony() {
  const rows = commandReadiness(state, engine).idleColonies;
  if (!rows.length) { toast('Every colony has production queued.'); return; }
  idleColonyCursor = (idleColonyCursor + 1) % rows.length; const planet = rows[idleColonyCursor];
  selected = planet.system; manageColony(planet.id); toast(`${planet.name} · awaiting production orders`);
}
function zoomAt(factor, clientX = null, clientY = null) {
  const canvas = $('#galaxy-canvas'); if (!canvas || !canvas.clientWidth) return;
  const rect = canvas.getBoundingClientRect(), w = canvas.clientWidth, h = canvas.clientHeight;
  const cx = clientX === null ? w / 2 : clientX - rect.left, cy = clientY === null ? h / 2 : clientY - rect.top;
  const next = Math.max(.6, Math.min(2.4, Math.round(zoom * factor * 100) / 100));
  if (next === zoom) return;
  // Keep the chart point under the pointer fixed: p = C + d·scale·zoom + pan.
  mapPan = { x: cx - w / 2 - (cx - w / 2 - mapPan.x) * next / zoom, y: cy - h / 2 - (cy - h / 2 - mapPan.y) * next / zoom };
  zoom = next; scheduleMapDraw();
}
function download(name, text, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function ownerName(owner) { return owner < 0 ? 'Unclaimed world' : pack.empires[owner].name; }
function shipCanvas(design, owner = player(), large = false, livery = null) { const roles = Array.isArray(design.parts) ? engine.designStats(design).roles : []; return `<canvas data-ship="${esc(design.hull)}" data-owner="${owner}" ${roles.length ? `data-roles="${roles.join(',')}"` : ''} ${livery ? `data-livery="${esc(livery)}"` : ''} ${large ? 'data-large="true"' : ''} role="img" aria-label="${esc(pack.hulls[design.hull].name)} ship silhouette"></canvas>`; }
// Foreign worlds show a fixed settlement density: their current population is not the player's information.
function planetCanvas(p) { const max = pack.planets[p.type].max, owner = p.owner >= 0 ? pack.empires[p.owner] : null; return `<canvas data-planet="${esc(pack.planets[p.type].palette)}" data-variant="${p.id % 8}" ${owner ? `data-owner="${owner.color}" data-pop="${p.owner === player() ? p.pop : Math.ceil(max / 2)}" data-max="${max}"` : ''} role="img" aria-label="${esc(pack.planets[p.type].name)} planet"></canvas>`; }
function progress(value, total) { return `<div class="progress" style="--progress:${Math.min(100, Math.max(0, value / total * 100))}%"><span></span></div>`; }
function pageHead(eyebrow, title, subtitle, actions = '') { return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="page-actions">${actions}</div></div>`; }
function readinessStrip() {
  const r = commandReadiness(state, engine);
  return `<section class="command-readiness" aria-label="Command readiness"><div class="readiness-heading"><span class="status-dot"></span><strong>COMMAND DECK</strong><small>TURN ${String(state.turn).padStart(3,'0')}</small></div><div class="readiness-items">${btn(`<strong>${r.idleFleets.length}</strong> idle ships`, 'next-idle', `${!r.idleFleets.length?'disabled':''} title="Select the next idle ship (N)"`, 'quiet')}${btn(`<strong>${r.idleColonies.length}</strong> idle colonies`, 'idle-colonies', '', 'quiet')}${btn(`<strong>${r.threats.length}</strong> hostile contacts`, 'readiness', '', r.threats.length?'quiet danger':'quiet')}${btn('Undo <kbd>Ctrl Z</kbd>', 'undo', `${undoStack.length?'':'disabled'} title="Withdraw the last accepted order this turn"`, 'quiet undo-link')}${btn('Command menu <kbd>Ctrl K</kbd>', 'command-menu', '', 'quiet command-menu-link')}</div></section>`;
}
function readinessDialog(confirmTurn = false) {
  const r = commandReadiness(state, engine);
  modal(confirmTurn ? 'Before the next turn' : 'Command readiness', `<p>Idle units may intentionally hold position. Only current sensor contacts appear here.</p><div class="readiness-summary"><div><strong>${r.idleFleets.length}</strong><small>SHIPS HOLDING</small></div><div><strong>${r.idleColonies.length}</strong><small>COLONIES IDLE</small></div><div><strong>${r.threats.length}</strong><small>HOSTILE SYSTEMS</small></div></div><div class="row wrap">${btn('Next idle ship', 'next-idle', r.idleFleets.length?'':'disabled', 'small')}${btn('Idle production queues', 'idle-colonies', '', 'small')}</div>${r.threats.length?`<h3>Current hostile contacts</h3><div class="command-results">${r.threats.map(t=>btn(`${esc(state.systems[t.system].name)} · ${t.ships} hostile ships`, 'jump-system', `data-id="${t.system}"`, 'quiet')).join('')}</div>`:''}${confirmTurn?`<div class="row wrap">${btn('Advance turn', 'end-confirmed', '', 'primary')}${btn('Keep planning', 'close', '', 'quiet')}</div>`:''}`);
}
function requestEndTurn() {
  if (state.winner !== null) return;
  const r = commandReadiness(state, engine);
  if (preferences.reviewTurn && (r.idleFleets.length || r.idleColonies.length || r.threats.length)) readinessDialog(true);
  else act({ type: 'endTurn' });
}
function nextIdleFleet() {
  const rows = commandReadiness(state, engine).idleFleets;
  if (!rows.length) { toast('Every ship has orders or is refitting.'); return; }
  const index = rows.findIndex(f => f.id === selectedFleet), ship = rows[(index + 1) % rows.length];
  selectedFleet = ship.id; selected = ship.system; view = 'galaxy'; closeDialog(); render(); revealSelection();
  toast(`${ship.name} · awaiting orders`);
}
function systemResults(query = '') {
  return chartedSystems(state, engine, query).map(s => btn(`<span>${esc(s.name)}</span><small>${s.surveyed?'SURVEYED':'FRONTIER SIGNAL'}</small>`, 'jump-system', `data-id="${s.id}"`, 'quiet')).join('') || '<p class="empty">No charted systems match. Explore to reveal more signals.</p>';
}
function commandMenu() {
  modal('Command menu', `<label>FIND A CHARTED SYSTEM<input id="command-search" type="search" autocomplete="off" placeholder="System name or number…"></label><div class="command-shortcuts">${btn('Next idle ship <kbd>N</kbd>', 'next-idle', '', 'small')}${btn('Home system <kbd>H</kbd>', 'home', '', 'small')}${btn('Review readiness', 'readiness', '', 'small')}${btn('Save / load', 'saves', '', 'small')}${btn('New expedition', 'new', '', 'small')}</div><div id="command-results" class="command-results" aria-label="Matching systems">${systemResults()}</div>`);
  $('#command-search').focus();
}
function scheduleMapDraw() {
  if (!mapFrame) mapFrame = requestAnimationFrame(() => { mapFrame = 0; drawGalaxy(); });
}
function revealSelection(target = selected) {
  const canvas = $('#galaxy-canvas'); if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return;
  const area=canvas.closest('.chart-viewport');if(area){area.scrollLeft=0;area.scrollTop=0;}
  const points = mapProjection(state.systems, canvas.clientWidth, canvas.clientHeight, zoom, mapPan), p = points[target];
  if (p && (p.x < 40 || p.x > canvas.clientWidth - 40 || p.y < 50 || p.y > canvas.clientHeight - 50)) {
    mapPan = { x: mapPan.x + canvas.clientWidth/2 - p.x, y: mapPan.y + canvas.clientHeight/2 - p.y }; drawGalaxy();
  }
}
function render() {
  const focus = captureFocus();
  const scrollers = lastRenderedView === view ? [...document.querySelectorAll('.table-scroll,.design-library,.nav')].map((el,index) => [index,el.scrollLeft,el.scrollTop]) : [];
  mapObserver?.disconnect(); cancelAnimationFrame(mapFrame); mapFrame = 0; mapDrag = null;
  previewEpoch++;
  document.documentElement.style.setProperty('--empire', pack.empires[player()].color);
  const e = state.empires[player()], yields = engine.income(state), owned = engine.colonies(state), ships = engine.fleets(state);
  const nav = [['galaxy', 'Galaxy map', '01'], ['colonies', 'Colonies', owned.length], ['fleets', 'Fleets', ships.length], ['research', 'Research', '04'], ['designer', 'Ship designer', '05'], ['diplomacy', 'Diplomacy', '06'], ['reports', 'Turn reports', state.log.length], ['mods', 'Campaign workshop', '08']];
  const victory = state.winner === null ? '' : `<div class="victory-banner"><div><div class="eyebrow">${state.winner === player() ? 'A NEW AGE BEGINS' : 'THE FRONTIER REMEMBERS'}</div><h2>${esc(pack.empires[state.winner].name)} prevails</h2><p>${esc(state.victory)}</p></div>${btn('New expedition', 'new', '', 'primary')}</div>`;
  $('#app').innerHTML = `<header class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">V</div><div><strong>VOIDWARD</strong><small>A QSOL-IMC SPACE 4X</small></div></div><div class="resources">${[['minerals', 'MINERALS'], ['energy', 'ENERGY'], ['research', 'RESEARCH']].map(([key, label]) => { const field = key === 'research' ? 'science' : key; return `<div class="resource" title="${field === 'energy' ? 'Net energy after fleet upkeep. At zero energy, fleet attack is halved.' : label + ' stockpile and yield per turn'}">${icon(key)}<span>${number(e[field])}<b>${plus(yields[field])}</b></span><small>${label}</small></div>`; }).join('')}</div>${btn('⌘', 'command-menu', 'aria-label="Open command menu" title="Command menu (Ctrl K)"', 'quiet command-access')}${btn(icon('sound'), 'settings', 'aria-label="Sound and display settings" title="Sound and display settings"', 'quiet settings-access')}<div class="turn-count"><strong>TURN ${String(state.turn).padStart(3, '0')}</strong><small>STARDATE ${2400 + Math.floor(state.turn / 10)}.${state.turn % 10}</small></div>${btn(`End turn ${icon('arrow')}`, 'end', state.winner !== null ? 'disabled' : '', 'primary end-turn')}</header>
  <div class="shell"><aside class="sidebar"><div class="empire-sign"><div class="sigil" style="color:${pack.empires[player()].accent};background:${pack.empires[player()].color}33">${['⌁','◈','✧','⊙','⟁','⊞'][player()]}</div><div><strong>${esc(pack.empires[player()].short)}</strong><small>HIGH COMMAND</small></div></div><nav class="nav" aria-label="Empire command">${nav.map(([id, title, count]) => `<button data-view="${id}" class="${view === id ? 'active' : ''}" aria-label="${title}" ${view === id ? 'aria-current="page"' : ''} title="${title}">${icon(id)}<span>${title}</span><span class="badge">${String(count).padStart(2, '0')}</span></button>`).join('')}</nav>
  <div><div class="sidebar-heading">EMPIRE DIRECTIVE</div><div class="objective"><div class="eyebrow">BEYOND THE HORIZON</div><p>${pack.scenario.victory==='objectives' ? 'Follow Campaign operations for discoveries, persistent route choices and victory requirements.' : owned.length < 2 ? 'Send a fleet to a neighbouring star. Establish your first frontier colony.' : `Establish ${pack.rules.colonyTarget} colonies, master all sciences, or become the last empire standing.`}</p>${progress(owned.length, pack.rules.colonyTarget)}<div class="row between" style="margin-top:10px"><small>COLONIES</small><small class="mono">${owned.length} / ${pack.rules.colonyTarget}</small></div></div></div>
  <div class="side-tools">${btn('Save / load', 'saves', '', 'quiet')}${btn(audio.enabled ? 'Sound on' : 'Sound off', 'sound', `aria-pressed="${audio.enabled}"`, 'quiet')}${btn('New game', 'new', '', 'quiet')}${btn('Settings', 'settings', '', 'quiet')}${btn('Field manual', 'help', '', 'quiet')}${btn('Commands', 'command-menu', '', 'quiet')}</div><div class="side-credit">EXPLORE. EXPAND.<br>EXPLOIT. EXTERMINATE.</div></aside>
  <main id="main" class="main" tabindex="-1">${victory}${readinessStrip()}${objectiveStrip()}${({ galaxy: galaxyView, colonies: coloniesView, fleets: fleetsView, research: researchView, designer: designerView, diplomacy: diplomacyView, reports: reportsView, mods: modsView }[view] || galaxyView)()}</main></div>
  <footer class="footer"><span><i class="status-dot"></i>${esc(pack.meta.title.toUpperCase())} <span style="color:#394c5b"> / </span> TURN ${state.turn} <span style="color:#394c5b"> / </span> SEED ${state.seed}</span><span>LOCAL COMMAND · VANILLAJS + ALIEN MATH</span></footer>`;
  paintCanvases();
  if ($('#galaxy-canvas')) { drawGalaxy(); mapObserver = new ResizeObserver(scheduleMapDraw); mapObserver.observe($('#galaxy-canvas')); }
  for (const [index,left,top] of scrollers) { const el=document.querySelectorAll('.table-scroll,.design-library,.nav')[index]; if(el){el.scrollLeft=left;el.scrollTop=top;} }
  lastRenderedView = view;
  restoreFocus(focus);
}
function paintCanvases(root = document) {
  root.querySelectorAll('canvas[data-planet]').forEach(c => paintPlanet(c, c.dataset.planet, Number(c.dataset.variant || 0), c.dataset.owner ? { owner: c.dataset.owner, pop: Number(c.dataset.pop || 0), max: Number(c.dataset.max || 1) } : {}));
  root.querySelectorAll('canvas[data-ship]').forEach(c => { const empire = pack.empires[Number(c.dataset.owner)], explicit = c.dataset.livery ? liveryCatalogue(importedLiveries).find(l => l.id === c.dataset.livery) : null; paintShip(c, pack.hulls[c.dataset.ship], empire, c.dataset.large === 'true', { livery: explicit || playerLivery(empire), roles: c.dataset.roles ? c.dataset.roles.split(',') : [] }); });
}
function galaxyView() {
  return pageHead('STELLAR CARTOGRAPHY', 'The known frontier', `${state.empires[player()].known.length} systems surveyed · ${state.systems.length} stars in the sector`, `${btn(icon('help'), 'help', 'aria-label="Open field manual"', 'quiet')}${btn('Save / load', 'saves', '', 'quiet')}`) +
  `<div class="chart-layout"><div><section class="card chart-card" aria-label="Interactive galaxy map"><div class="chart-toolbar"><div class="segmented" aria-label="Map display">${[['political', 'Territory'], ['survey', 'Exploration'], ['routes', 'Fleet orders'], ['intel', 'Intel age']].map(([id, label]) => btn(label, 'map-mode', `data-mode="${id}" aria-pressed="${mapMode === id}"`, mapMode === id ? 'active' : '')).join('')}</div><span class="mono muted" style="font-size:9px">SECTOR ${String(state.seed % 999).padStart(3, '0')} / ${pack.rules.columns} : ${pack.rules.rows}</span></div><div class="chart-viewport ${panMode?'pan-enabled':''}"><canvas id="galaxy-canvas" aria-hidden="true"></canvas><div id="stars" class="star-layer" role="group" aria-label="Select a star system"></div><div class="map-coordinates">DEEP SPACE NETWORK<br><span class="mint">●</span> TELEMETRY ONLINE</div><div class="map-void">THE UNCHARTED REACH</div><div id="map-tip" class="map-tip" role="tooltip" hidden></div><canvas id="minimap" class="minimap" aria-label="Chart overview. Select a point to centre the chart there." ${preferences.minimap ? '' : 'hidden'}></canvas><div class="map-controls">${btn('↔', 'pan-mode', `aria-label="Pan galaxy" aria-pressed="${panMode}" title="Toggle drag to pan (touch or mouse)"`, panMode?'active':'')}${btn('−', 'zoom-out', 'aria-label="Zoom out"')}${btn('⌖', 'zoom-reset', 'aria-label="Fit galaxy"')}${btn('+', 'zoom-in', 'aria-label="Zoom in"')}</div></div><div class="map-legend"><span><i class="legend-dot" style="--dot:var(--empire)"></i>YOUR EMPIRE</span><span><i class="legend-dot" style="--dot:var(--gold)"></i>UNCLAIMED</span><span><i class="legend-dot" style="--dot:#647589"></i>UNSURVEYED</span><span><i class="legend-dot" style="--dot:#f28b71"></i>HOSTILE CONTACT</span><span class="gold">⌘ ANCIENT ARCHIVE</span><span class="muted">STAR TINT · SPECTRAL CLASS</span>${mapMode === 'intel' ? '<span class="mint">RINGS FADE WITH REPORT AGE</span>' : ''}</div></section>
  <label class="system-picker">Find a charted system<select id="system-jump">${[...engine.visibleSystems(state)].map(id=>`<option value="${id}" ${id===selected?'selected':''}>${esc(state.systems[id].name)}${state.empires[player()].known.includes(id)?'':' · unsurveyed'}</option>`).join('')}</select></label><div class="card dispatch-strip">${icon('fleets')}<div><strong>${selectedFleet ? 'Fleet selected · choose a destination' : 'Your next command'}</strong><p>${selectedFleet ? 'Select a connected star, then confirm Plot course. Orders resolve when you end the turn.' : 'Select a ship in the system panel, then a neighbouring star to chart its course.'}</p></div></div></div><aside class="inspector" aria-label="Selected system">${inspector()}</aside></div>`;
}
function drawGalaxy() {
  const canvas = $('#galaxy-canvas'), stars = $('#stars'); if (!canvas || !stars) return;
  const points = drawMap(canvas, state, engine, selected, selectedFleet, zoom, mapMode, { pan: mapPan, detail: preferences.detail });
  if (!points.length) return;
  const minimap = $('#minimap'); if (minimap && !minimap.hidden) drawMinimap(minimap, state, engine, { w: canvas.clientWidth, h: canvas.clientHeight, zoom, pan: mapPan });
  hideMapTip();
  // A resize, zoom or pan only moves the existing controls. Keeping node identity
  // preserves keyboard focus, pointer capture and assistive-technology context.
  if (!stars.childElementCount) {
    const visible = engine.visibleSystems(state), known = new Set(state.empires[player()].known), counts = new Map();
    for (const ship of engine.fleets(state)) counts.set(ship.system, (counts.get(ship.system) || 0) + 1);
    stars.innerHTML = state.systems.filter(s => visible.has(s.id)).map(s => {
      const intel = engine.systemIntel(state, s.id), colony = intel?.planets.find(p => p.owner >= 0);
      const spectral = spectralClass(s.id, state.seed), color = known.has(s.id) && colony ? pack.empires[colony.owner].color : spectral.color;
      const count = counts.get(s.id) || 0, danger = intel?.fleets.some(f => state.relations[player()][f.owner] === 'war' && f.attack > 0);
      const label = known.has(s.id) ? s.name : `${s.name} · unsurveyed`;
      return `<button class="star-node ${danger?'danger':''} ${known.has(s.id)?'':'frontier'} ${selected===s.id?'selected':''} ${colony&&colony.owner===player()?'owned':''} ${s.id===pack.empires[player()].home?'home':''}" style="--star:${color};--spectral:${spectral.color}" data-action="system" data-id="${s.id}" data-spectral="${spectral.name}" aria-label="${esc(label)}" aria-pressed="${selected===s.id}" title="${esc(label)}"><i></i><span>${esc(s.name)}</span>${count?`<b class="fleet-count">▴ ${count}</b>`:''}${danger?'<b class="danger-mark" aria-label="Hostile fleet last reported">!</b>':''}</button>`;
    }).join('');
  }
  const nodes = [...stars.querySelectorAll('.star-node')];
  for (const node of nodes) {
    const p = points[Number(node.dataset.id)];
    node.style.left = `${p.x}px`; node.style.top = `${p.y}px`;
    node.classList.remove('label-crowded');
  }
  if (preferences.labels === 'all') return;
  const labels = nodes.map(node => ({ node, rect: node.querySelector('span').getBoundingClientRect(),
    priority: node.classList.contains('selected') ? 0 : node.classList.contains('frontier') ? 2 : 1
  })).sort((a, b) => a.priority - b.priority);
  const placed = [];
  for (const { node, rect } of labels) {
    const crowded = placed.some(other => rect.left < other.right + 5 && rect.right + 5 > other.left && rect.top < other.bottom + 3 && rect.bottom + 3 > other.top);
    node.classList.toggle('label-crowded', crowded);
    if (!crowded) placed.push(rect);
  }
}

function systemBrief(id) {
  const s = state.systems[id], known = state.empires[player()].known.includes(id), report = known ? engine.systemIntel(state, id) : null, spectral = spectralClass(id, state.seed);
  const mine = engine.fleets(state).filter(f => f.system === id).length, rows = [];
  if (!report) rows.push('Unsurveyed frontier signal');
  else {
    const owners = new Map(); for (const p of report.planets) if (p.owner >= 0) owners.set(p.owner, (owners.get(p.owner) || 0) + 1);
    rows.push(`${report.planets.length} worlds${owners.size ? ' · ' + [...owners].map(([o, n]) => `${esc(pack.empires[o].short)} ${n}`).join(', ') : ' · unclaimed'}`);
    const hostile = report.fleets.filter(f => f.owner !== player() && state.relations[player()][f.owner] === 'war').reduce((n, f) => n + f.ships, 0);
    if (hostile) rows.push(`${hostile} hostile ship${hostile === 1 ? '' : 's'} reported`);
    if (report.archive) rows.push('Ancient archive detected');
    rows.push(report.current ? 'Live sensor coverage' : `Last seen turn ${report.turn}`);
  }
  if (mine) rows.push(`${mine} of your ship${mine === 1 ? '' : 's'} in orbit`);
  return `<strong>${esc(s.name)}</strong><small>CLASS ${spectral.name} STAR · ${s.links.length} WARP LANES</small>${rows.map(r => `<span>${r}</span>`).join('')}`;
}
function showMapTip(node) {
  const tip = $('#map-tip'), canvas = $('#galaxy-canvas'); if (!tip || !canvas || !node?.dataset.id || view !== 'galaxy') return;
  tip.innerHTML = systemBrief(Number(node.dataset.id)); tip.hidden = false;
  const y = parseFloat(node.style.top) || 0; tip.classList.toggle('above', y > canvas.clientHeight * .68);
  tip.style.left = node.style.left; tip.style.top = node.style.top;
}
function hideMapTip() { const tip = $('#map-tip'); if (tip) tip.hidden = true; }
function inspector() {
  const sys = state.systems[selected], known = state.empires[player()].known.includes(selected), local = engine.fleets(state).filter(f => f.system === selected), ship = state.fleets.find(f => f.id === selectedFleet);
  const intel=engine.systemIntel(state,selected);
  const planets = known ? state.planets.filter(p => p.system === selected).map(p => ({ ...p, owner: intel?.planets.find(x=>x.id===p.id)?.owner ?? -1 })) : [];
  const planetRows = planets.map(p => {
    const ark = local.find(f => engine.role(f.design, 'colony'));
    return `<div class="planet-row">${planetCanvas(p)}<div><h3>${esc(p.name)}</h3><small>${esc(pack.planets[p.type].name)} · ${p.owner === player() ? `${p.pop}M colonists` : esc(ownerName(p.owner))}</small>${p.owner === player() ? btn('Manage colony', 'manage', `data-id="${p.id}"`, 'small quiet') : p.owner === -1 && ark ? btn('Colonise', 'colonize', `data-planet="${p.id}" data-fleet="${ark.id}"`, 'small primary') : `<small>${p.owner < 0 ? `Capacity ${pack.planets[p.type].max}M · mineral yield ${pack.planets[p.type].minerals}` : 'Sovereign territory'}</small>`}</div></div>`;
  }).join('');
  const route = ship ? engine.route(state, ship.system, selected) : [];
  const group=state.groups.find(g=>g.ships.includes(selectedFleet)),speed=ship?(group?Math.min(...state.fleets.filter(f=>group.ships.includes(f.id)).map(f=>engine.designStats(f.design).speed)):engine.designStats(ship.design).speed):1;
  const order = ship ? `<div class="selected-order"><div class="eyebrow">${esc(group?group.name+' · '+group.ships.length+' ships':ship.name)}</div><p>${ship.system === selected ? 'Select a neighbouring star to prepare a destination.' : route.length ? `${route.length - 1} warp lane(s) · ${Math.ceil((route.length - 1) / speed)} turn(s)` : 'No known route to this destination.'}</p>${btn('Plot course →', 'move', `data-target="${selected}" ${route.length < 2 ? 'disabled' : ''}`, 'primary')}${ship.path.length ? `<p>Current order: ${esc(state.systems[ship.path.at(-1)].name)}</p>${btn('Cancel order', 'hold', '', 'quiet small')}` : ''}</div>` : '';
  return `<section class="card"><div class="system-hero"><div class="eyebrow">${known ? intel?.current ? 'CURRENT SENSOR CONTACT' : 'LAST SEEN · TURN ' + (intel?.turn || state.turn) : 'FRONTIER SIGNAL'}</div><h2>${esc(sys.name)}</h2><span class="pill">${known ? planets.some(p => p.owner === player()) ? esc(pack.empires[player()].short + ' SPACE') : 'SURVEY COMPLETE' : 'AWAITING SURVEY'}</span></div><div class="system-meta"><span>${known ? planets.length + ' WORLDS' : 'UNKNOWN WORLDS'}</span><span>${sys.links.length} WARP LANES</span></div>${known ? planetRows : '<div class="empty">Send a ship to survey this star. Its worlds and inhabitants will appear on arrival.</div>'}${known && intel?.archive ? '<div class="card-pad gold" style="font-size:11px">⌘ Ancient archive detected. Bring a survey array to investigate it; distant archive status may be out of date.</div>' : ''}</section>
  <section class="card"><div class="card-head"><h3>FLEETS IN SYSTEM</h3><small>${local.length} FRIENDLY</small></div>${local.map(f => `<button class="fleet-row ${selectedFleet === f.id ? 'active' : ''}" data-action="select-fleet" data-id="${f.id}" aria-pressed="${selectedFleet === f.id}">${shipCanvas(f.design)}<div><strong>${esc(f.name)}</strong><small>${esc(pack.hulls[f.design.hull].name)} · ${f.path.length ? 'UNDER ORDERS' : 'AWAITING ORDERS'}</small></div><i class="indicator"></i></button>`).join('') || '<div class="empty">No friendly ships in orbit.</div>'}${known ? (intel?.fleets || []).filter(f=>f.owner!==player()).map(f=>`<div class="fleet-row"><div><strong>${esc(pack.empires[f.owner].short)} · ${f.ships} ships</strong><small>${f.attack} estimated attack · ${intel.current?'current contact':'last seen T'+intel.turn}</small></div></div>`).join('') : ''}${order}</section>`;
}
function ensureDesigner() { if (!designer || !pack.hulls[designer.hull]) designer = { ...structuredClone(state.empires[player()].designs[0]), name: 'New expedition class' }; }
function baseDesignerView() {
  ensureDesigner(); const e = state.empires[player()], stats = engine.designStats(designer), hull = pack.hulls[designer.hull]; let valid = true, reason = 'Ready to register';
  try { engine.checkDesign(designer, e.tech, player()); } catch (error) { valid = false; reason = error.message; }
  const availableHulls = Object.values(pack.hulls).filter(h => (h.faction === -1 || h.faction === player()) && h.level <= e.tech[h.tech]);
  return pageHead('NAVAL ARCHITECTURE', 'Design your advantage', 'Choose a hull. Fit components. Save a class. Build it at any orbital shipyard.', btn('Campaign workshop', 'mods', '', 'quiet')) +
  `<div class="split-view"><div class="card"><div class="blueprint">${shipCanvas(designer, player(), true)}<span class="bp-tag">${esc(hull.name.toUpperCase())} / SCHEMATIC 01</span></div><div class="designer-fields"><label>CLASS NAME<input id="design-name" maxlength="32" value="${esc(designer.name)}"></label><label>HULL FRAME<select id="design-hull">${availableHulls.map(h => `<option value="${h.id}" ${h.id === designer.hull ? 'selected' : ''}>${esc(h.name)} · ${h.slots} slots · ${h.hp} base hull</option>`).join('')}</select></label><label>FLEET LIVERY · COSMETIC<select id="design-livery">${liveryOptions(pack.empires[player()])}</select></label><div class="metric-grid"><div><strong>${stats.attack}</strong><small>ATTACK</small></div><div><strong>${stats.hp}</strong><small>HULL</small></div><div><strong>${stats.cost}</strong><small>MINERALS</small></div></div><div class="row between"><span class="mono ${stats.slots > hull.slots ? 'gold' : 'mint'}">${stats.slots} / ${hull.slots} SLOTS</span><small>${stats.speed} lane(s) per turn</small></div><div class="role-pills">${stats.roles.map(r => `<i class="role-pill ${r}">${ROLE_LABELS[r] || esc(r)}</i>`).join('') || '<small>No modules fitted</small>'}</div>${progress(stats.slots, hull.slots)}<div>${designer.parts.map((id, index) => `<div class="part-row"><span>${esc(pack.components[id].name)} <small> · ${pack.components[id].slots} slot(s)</small></span>${btn('−', 'remove-part', `data-index="${index}" aria-label="Remove ${esc(pack.components[id].name)}"`, 'quiet small')}</div>`).join('') || '<p class="muted">An empty frame. Install an engine to begin.</p>'}</div><small>${esc(reason)}</small>${btn('Register ship class', 'save-design', valid ? '' : 'disabled', 'primary')}</div></div><section class="card"><div class="card-head"><h3>COMPONENT CATALOGUE</h3><small>${Object.keys(pack.components).length} MODULES</small></div><div class="card-pad component-list">${Object.values(pack.components).map(c => { const locked = c.level > e.tech[c.tech]; return `<div class="production-item"><div><p>${esc(c.name)} ${locked ? '<span class="gold">⌑</span>' : ''}</p><small>${c.slots} slot(s) · ${c.cost} ◇ ${c.attack ? ' · +' + c.attack + ' ATK' : ''}${c.hp ? ' · +' + c.hp + ' HULL' : ''}</small><small style="display:block;margin-top:5px">${locked ? 'Requires ' + esc(pack.tech[c.tech].name) + ' ' + roman(c.level) : esc(c.description)}</small></div>${btn('+', 'add-part', `data-part="${c.id}" aria-label="Add ${esc(c.name)}" ${locked || stats.slots + c.slots > hull.slots ? 'disabled' : ''}`, 'small')}</div>`; }).join('')}</div></section></div><section class="card" style="margin-top:20px"><div class="card-head"><h3>REGISTERED CLASSES</h3><small>Click to copy and modify</small></div><div class="design-library">${e.designs.map(d => btn(`${shipCanvas(d)}${esc(d.name)}`, 'copy-design', `data-design="${d.id}"`, 'quiet')).join('')}</div></section>`;
}
function baseDiplomacyView() {
  const e = state.empires[player()];
  return pageHead('FOREIGN AFFAIRS', 'Voices in the void', 'Trade, coexist, or bring your fleets to bear. Contact begins through exploration.') + `<div class="cards">${pack.empires.filter(f => f.id !== player()).map(f => {
    const contact = e.contacts.includes(f.id), relation = state.relations[player()][f.id], sample = pack.ships.find(d => d.empire===f.id && engine.role(d, 'assault')) || pack.ships.find(d=>d.empire===f.id);
    return `<section class="card"><div class="diplomacy-art">${contact ? shipCanvas(sample, f.id) : '<span class="mono muted" style="font-size:45px">?</span>'}<div class="sigil" style="color:${f.color};background:${f.color}22">${contact ? '⌁' : '?'}</div></div><div class="card-pad"><div class="eyebrow" style="color:${f.color}">${contact ? esc(f.short) : 'UNIDENTIFIED SIGNAL'}</div><h2>${contact ? esc(f.name) : 'Unknown civilisation'}</h2><p class="muted" style="font-size:12px;margin:12px 0 20px">${contact ? esc(f.ethos) : 'Send scouts beyond the frontier to establish contact.'}</p>${contact ? `<span class="pill" style="color:${relation === 'war' ? 'var(--danger)' : f.color}">${state.empires[f.id].defeated ? 'DEFEATED' : relation.toUpperCase()}</span><div class="row wrap" style="margin-top:20px">${relation === 'neutral' ? btn(`Trade pact · ${pack.rules.tradeCost} ⚡`, 'diplomacy', `data-target="${f.id}" data-offer="trade"`, 'small') : ''}${relation === 'war' ? btn(`Peace accord · ${pack.rules.peaceCost} ⚡`, 'diplomacy', `data-target="${f.id}" data-offer="peace"`, 'small') : btn('Declare war', 'war-prompt', `data-target="${f.id}"`, 'danger small quiet')}</div>` : '<small>NO DIPLOMATIC CHANNEL</small>'}</div></section>`;
  }).join('')}</div><div class="card card-pad" style="margin-top:20px"><p class="muted" style="font-size:12px">Trade agreements provide +${pack.rules.tradeIncome} energy per turn to both empires. Peace accords are accepted for the stated energy cost. AI empires may declare war after their opening grace period; they honour trade pacts. Capture a planet with marine-equipped ships whose combined attack meets its defence, after clearing the defending fleet.</p></div>`;
}
function modsView() {
  return pageHead('CAMPAIGN WORKSHOP', 'Make the universe yours', 'Editable text. Original worlds. No account, server, or build step.', btn('Import .txt folder', 'import-mod', '', 'primary')) +
  `<div class="cards">${campaigns.map((c, i) => `<section class="card mod-card"><div class="mod-swatch">CAMPAIGN / ${String(i + 1).padStart(2, '0')}</div><div class="eyebrow">INSTALLED CAMPAIGN</div><h2>${esc(c.title)}</h2><p>${esc(c.description || 'A locally installed campaign. Start an expedition to explore its universe.')}</p><div class="row">${btn('Start campaign', 'campaign-prompt', `data-pack="${c.id}"`, 'primary small')}${btn('Resume', 'resume-pack', `data-pack="${c.id}"`, 'quiet small')}</div></section>`).join('')}</div>
  <section class="card card-pad" style="margin-top:20px"><div class="eyebrow">ACTIVE PACK / ${esc(pack.meta.id)} @ ${esc(pack.meta.version)}</div><h2>Every empire starts in a text file.</h2><p class="muted" style="font-size:12px;margin:12px 0 20px">Edit names, faction colours, ship silhouettes, component stats, starting ships, world types, starlanes, research, buildings and campaign rules. Text imports are data only. For new behaviours, register local source hooks using the included example.</p><div class="row wrap">${btn('Export campaign pack', 'export-pack', '', 'small')}${btn('Visual workshop', 'visual-workshop', '', 'primary small')}<a class="button small quiet" href="editor/index.html">3D Workbench</a>${btn('Edit text files', 'edit-pack', '', 'small quiet')}<a href="MOD_GUIDE.md" target="_blank" rel="noopener">Modding guide ↗</a></div></section>
  <section class="card card-pad" style="margin-top:20px"><div class="eyebrow">HANGAR LIVERIES · ${esc(pack.empires[player()].short)}</div><p class="muted" style="font-size:12px;margin:10px 0 16px">Cosmetic hull finishes for your fleet. Rival fleets receive a stable automatic livery; override any faction in Settings. Import a validated livery pack to add your own.</p><div class="livery-cards">${liveryCatalogue(importedLiveries).map(l => { const sample = pack.ships.find(s => s.empire === player() && engine.role(s, 'assault')) || pack.ships.find(s => s.empire === player()) || { hull: Object.keys(pack.hulls)[0], parts: [] }; const active = playerLivery().id === l.id; return `<div class="livery-card ${active ? 'active' : ''}">${shipCanvas(sample, player(), false, l.id)}<strong>${esc(l.name)}</strong><small>${esc(l.description)}</small>${btn(active ? 'In service' : 'Use for my fleet', 'use-livery', `data-id="${esc(l.id)}" ${active ? 'disabled' : ''}`, 'small ' + (active ? 'quiet' : 'primary'))}</div>`; }).join('')}</div></section>
  <section class="card card-pad" style="margin-top:20px"><div class="eyebrow">FACTION SHIP ATLAS</div><div class="cards">${pack.empires.map(f => `<div><h3 style="color:${f.color}">${esc(f.name)}</h3><div class="design-library" style="padding:10px 0">${Object.values(pack.hulls).filter(h => h.faction === f.id || h.faction === -1).map(h => `<div style="text-align:center;min-width:100px">${shipCanvas({ hull: h.id }, f.id)}<small>${esc(h.name)}</small></div>`).join('')}</div></div>`).join('')}</div></section>`;
}
function help() {
  modal('Your field manual', `<p>A classic turn-based space 4X, inspired by Space Empires IV. Nothing advances until you end a turn.</p><div class="help-grid"><div><h3>01 · Explore</h3><p>In the galaxy view, select a ship, then a neighbouring star and <b>Plot course</b>. End your turn to travel. The route can cross surveyed systems and end at an unsurveyed frontier star. Survey arrays recover golden ancient archives.</p><h3>02 · Expand</h3><p>Bring a colony ark to an unclaimed world, then choose <b>Colonise</b>. This consumes the ark and costs ${pack.rules.colonizeMinerals} minerals + ${pack.rules.colonizeEnergy} energy. You can also colonise another planet in your starting system.</p></div><div><h3>03 · Develop</h3><p>Manage a colony to queue facilities or ships. A shipyard enables shipbuilding and repairs. Research unlocks components; create a new design to use them. Existing ships retain their installed parts.</p><h3>04 · Prevail</h3><p>Sign treaties or declare war after first contact. Combat resolves each turn. Marine ships can capture planets once defenders are gone and their combined attack meets planetary defence. At zero energy, fleet attack is halved.</p></div></div><h3>Campaign objectives and command tools</h3><p>Scenario packs list their goals in <b>Objectives &amp; choices</b>. Choosing a route closes alternative branches; progress is stored in your save. Fleets can form task forces, auto-explore, patrol, return to a shipyard or refit. Production queues can be reordered without losing work. Search and sort colony and fleet manifests as your empire grows.</p><h3>Victory conditions</h3><p>${pack.scenario.victory==='objectives' ? 'This expedition uses scenario objectives. Complete a victory route after turn '+pack.scenario.minVictoryTurn+'. '+(pack.scenario.defeatAtLimit?'The deadline is a defeat condition. ':'')+'Legacy expansion and science victories are disabled. The following describes legacy campaigns: ' : ''}Found ${pack.rules.colonyTarget} colonies, research every field to level ${roman(pack.rules.maxTech)}, or eliminate the other empires. At turn ${pack.rules.turnLimit}, the highest score wins: 100 per colony, 25 per research level and 5 per surviving ship. Loss of all colonies and colony arks ends your campaign.</p><h3>Controls & saves</h3><p>Mouse and touch: select, then confirm an order. Keyboard: Tab through controls; Enter/Space activates a focused button. <b>E</b> ends a turn; <b>1–8</b> change command views; <b>?</b> opens this guide. <b>N</b> selects the next idle ship; <b>C</b> opens the next idle colony; <b>H</b> returns home; <b>Ctrl/Cmd K</b> or <b>/</b> opens the searchable command menu. <b>Ctrl/Cmd Z</b> withdraws the last accepted order this turn (ending a turn is final). Mouse wheel or <b>+</b>/<b>−</b> zoom around the pointer, <b>0</b> fits the galaxy, and hovering or focusing a star shows its brief. The minimap recentres the chart. Settings offer themes, fleet liveries, the Intel age chart overlay and seeded E8 music variations. Arrow keys move between focused star targets. Drag empty chart space with a mouse, or enable <b>Pan galaxy</b> for touch; Fit galaxy resets the view. Settings offers full labels, high contrast and an optional idle-unit turn review. Gameplay shortcuts are disabled in forms and dialogs. Standard gamepad: D-pad cycles visible stars, A selects, B clears the fleet selection. Held controls must return to neutral after focus loss.</p><p>Accepted orders autosave in this browser. Export a save before clearing site data. Each campaign content version has a separate save slot. Save files include their complete text pack. You can play offline after the first complete cache installation, or serve a downloaded checkout locally.</p><div class="row">${btn('Back to the frontier', 'close', '', 'primary')}${btn('Sound ' + (audio.enabled ? 'on' : 'off'), 'sound', '', 'quiet')}</div>`);
}
function campaignBriefing(candidate, empireId) {
  const faction = candidate.empires[empireId], start = candidate.starts.find(x => x.empire === empireId);
  const positions = candidate.map.map(s => candidate.layout.find(p => p.id === s.id) || { id:s.id, x:s.id%candidate.rules.columns, y:Math.floor(s.id/candidate.rules.columns) });
  const xs=positions.map(p=>p.x),ys=positions.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),dx=Math.max(1,Math.max(...xs)-minX),dy=Math.max(1,Math.max(...ys)-minY);
  const at=id=>({x:20+(positions[id].x-minX)/dx*360,y:20+(positions[id].y-minY)/dy*160});
  const lanes=candidate.map.flatMap(s=>s.links.filter(n=>n>s.id).map(n=>`<line x1="${at(s.id).x}" y1="${at(s.id).y}" x2="${at(n).x}" y2="${at(n).y}"/>`)).join('');
  const stars=candidate.map.map(s=>{const home=candidate.empires.find(e=>e.home===s.id);return `<circle cx="${at(s.id).x}" cy="${at(s.id).y}" r="${home?4.5:2}" fill="${home?home.color:'#7392a5'}"/>`;}).join('');
  const ships=candidate.ships.filter(s=>s.empire===empireId);
  return `<section class="expedition-briefing" style="--faction:${faction.color}"><div class="briefing-map"><svg viewBox="0 0 400 200" role="img" aria-label="Campaign starlane overview and faction home positions"><g stroke="#385667" stroke-width="1">${lanes}</g>${stars}</svg><span>${candidate.map.length} STARS / ${candidate.scenario.playable.length} PLAYABLE EMPIRES</span></div><div class="briefing-body"><div class="eyebrow">YOUR EXPEDITION</div><h3>${esc(candidate.meta.title)}</h3><p>${esc(candidate.meta.description)}</p><div class="briefing-deadline">${candidate.scenario.victory==='objectives'?`Objective victory from turn ${candidate.scenario.minVictoryTurn}`:'Expansion · science · conquest'} <span>DEADLINE ${candidate.rules.turnLimit}</span></div><div class="faction-brief"><div><strong>${esc(faction.name)}</strong><p>${esc(faction.ethos)}</p><small>HOME · ${esc(candidate.systemNames[faction.home])}</small></div><div class="briefing-ships">${ships.slice(0,3).map(s=>`<canvas data-briefing-hull="${esc(s.hull)}" role="img" aria-label="${esc(candidate.hulls[s.hull].name)}"></canvas>`).join('')}</div></div><div class="briefing-resources"><span><b>${number(start?.minerals??candidate.rules.startMinerals)}</b> minerals</span><span><b>${number(start?.energy??candidate.rules.startEnergy)}</b> energy</span><span><b>${ships.length}</b> starting ships</span></div></div></section>`;
}
function refreshBriefing(candidate) {
  newCandidate=candidate;
  const holder=$('#new-briefing'),empireId=Number($('#new-player')?.value);
  if(!holder || !candidate.empires[empireId])return;
  holder.innerHTML=campaignBriefing(candidate,empireId);
  holder.querySelectorAll('[data-briefing-hull]').forEach(c=>paintShip(c,candidate.hulls[c.dataset.briefingHull],candidate.empires[empireId],false,{livery:liveryFor(candidate.empires[empireId],candidate,preferences.liveries,importedLiveries),roles:[...new Set((candidate.ships.find(s=>s.empire===empireId&&s.hull===c.dataset.briefingHull)?.parts||[]).map(id=>candidate.components[id]?.kind).filter(Boolean))]}));
}
async function newGameDialog(id = null) {
  const epoch=++campaignLoadEpoch, wanted=id||extension||'custom';
  const candidate=wanted==='custom'?pack:(await registered(wanted)).pack;
  if(epoch!==campaignLoadEpoch)return;
  modal('Begin an expedition', `<p>Your current campaign is saved. Starting again in the same campaign slot replaces that slot; export it first if you want to keep both.</p><div class="expedition-controls"><label>CAMPAIGN<select id="new-pack">${campaigns.map(c=>`<option value="${c.id}" ${c.id===wanted?'selected':''}>${esc(c.title)}</option>`).join('')}${!extension?`<option value="custom" ${wanted==='custom'?'selected':''}>Current imported campaign</option>`:''}</select></label><label>PLAYABLE EMPIRE<select id="new-player">${playableOptions(candidate)}</select></label><label>GALAXY SEED<input id="new-seed" type="number" min="0" max="4294967295" step="1" value="2401"></label><label>AI TEMPERAMENT<select id="new-difficulty"><option value="relaxed">Patient · longer opening peace</option><option value="standard" selected>Standard · a contested frontier</option><option value="veteran">Aggressive · earlier declarations of war</option></select></label></div><div id="new-briefing" aria-live="polite"></div><div class="row wrap">${btn('Launch expedition','launch','','primary')}${btn('Export current save','export-save','','quiet')}</div>`);
  refreshBriefing(candidate);
}
async function changeNewCampaign(id) {
  const epoch=++campaignLoadEpoch,launch=$('[data-action="launch"]'),selector=$('#new-player');
  newCandidate=null;launch.disabled=true;selector.disabled=true;
  $('#new-briefing').innerHTML='<p class="briefing-loading" role="status">Opening campaign briefing…</p>';
  try {
    const candidate=id==='custom'?pack:(await registered(id)).pack;
    if(epoch!==campaignLoadEpoch || !launch.isConnected)return;
    selector.innerHTML=playableOptions(candidate);refreshBriefing(candidate);launch.disabled=false;selector.disabled=false;
  } catch(error) {
    if(epoch===campaignLoadEpoch && launch.isConnected) {
      $('#new-briefing').innerHTML=`<p class="diagnostics">${esc(error.message)} Choose another campaign or retry after reconnecting.</p>`;
      selector.innerHTML='';toast(error.message,true);
    }
  }
}

function savesDialog() { modal('Campaign records', `<p>Campaigns autosave after every accepted order. Export a self-contained save to transfer your campaign or keep a backup.</p><div class="row wrap">${btn('Export save', 'export-save', '', 'primary')}${btn('Import save', 'import-save')}${btn('Save now', 'save-now')}</div><h3>Current record</h3><p>${esc(pack.meta.title)} · turn ${state.turn} · seed ${state.seed}<br>${engine.colonies(state).length} colonies · ${engine.fleets(state).length} ships</p>`); }

document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled || !state) return;
  try {
    if (button.dataset.view) { closeDialog(); view = button.dataset.view; render(); audio.effect(); return; }
    const d = button.dataset;
    switch (d.action) {
      case 'visual-workshop': openWorkshop(); break;
      case 'workshop-tab': workshopTab=d.tab;showWorkshop();break;
      case 'workshop-star': workshopSystem=Number(d.id);showWorkshop();break;
      case 'workshop-system-save': {
        let raw=Workshop.setLayout(editorFiles,workshopSystem,Number($('#workshop-x').value),Number($('#workshop-y').value));
        raw=Workshop.editRow(raw,'map',workshopSystem,{relic:$('#workshop-relic').value});
        const names=draftPack().systemNames.slice();names[workshopSystem]=$('#workshop-system-name').value;
        editorFiles=Workshop.patchFiles(raw,{'system_names.txt':names.join('\n')+'\n'});showWorkshop();break;
      }
      case 'workshop-lane': editorFiles=Workshop.setLane(editorFiles,workshopSystem,Number($('#workshop-link').value),d.enable==='true');showWorkshop();break;
      case 'workshop-home': editorFiles=Workshop.updateEmpire(editorFiles,Number($('#workshop-home').value),{home:workshopSystem});showWorkshop();break;
      case 'workshop-record-save': { const records=Workshop.readRows(editorFiles,workshopTable),row=Object.fromEntries([...document.querySelectorAll('[data-workshop-field]')].map(el=>[el.dataset.workshopField,el.value]));records[workshopRow]=row;editorFiles=Workshop.writeRows(editorFiles,workshopTable,records);showWorkshop();break; }
      case 'workshop-record-delete': {const records=Workshop.readRows(editorFiles,workshopTable);records.splice(workshopRow,1);editorFiles=Workshop.writeRows(editorFiles,workshopTable,records);workshopRow=0;showWorkshop();break;}
      case 'workshop-settings-save': {
        let raw=editorFiles;
        for(const [key,id] of [['id','id'],['version','version'],['title','title'],['description','description']])raw=Workshop.editSetting(raw,'campaign',key,$('#workshop-'+id).value,{validate:false});
        for(const [key,id] of [['playable','playable'],['victory','victory'],['minVictoryTurn','min-turn'],['defeatAtLimit','deadline']])raw=Workshop.editSetting(raw,'scenario',key,$('#workshop-'+id).value,{validate:false});
        editorFiles=parsePack(raw).raw;showWorkshop();break;
      }
      case 'workshop-text-save': editorFiles=Workshop.patchFiles(editorFiles,{[editingFile]:$('#visual-pack-text').value});showWorkshop();break;
      case 'workshop-download-text': download(editingFile,$('#visual-pack-text').value,'text/plain');break;
      case 'workshop-validate': {const result=Workshop.diagnosePack(editorFiles);if(!result.ok)throw new Error(result.diagnostics.map(x=>x.message).join('\n'));toast(`Valid campaign: ${result.pack.map.length} stars, ${result.pack.empires.length} empires. Preview updated.`);showWorkshop();break;}
      case 'workshop-export': download(`${draftPack().meta.id}-campaign.json`,Workshop.exportPack(editorFiles));break;
      case 'workshop-sdk-export': download(`${draftPack().meta.id}-sdk.json`,Workshop.exportSDKPack(editorFiles));break;
      case 'workshop-import': $('#workshop-upload').click();break;
      case 'workshop-launch': modal('Launch workshop draft',`<p>${esc(draftPack().meta.title)} is validated as a data-only pack. Choose an empire to play.</p><label>EMPIRE<select id="draft-player">${playableOptions(draftPack())}</select></label><div class="row">${btn('Launch edited universe','workshop-start','','primary')}</div>`);break;
      case 'workshop-start': await activate(draftPack(),{},null,null,state.seed,state.difficulty,Number($('#draft-player').value));toast('Workshop campaign launched.');break;
      case 'workshop-create': createWorkshopDialog();break;
      case 'workshop-generate': editorFiles=Workshop.createCampaign(editorFiles,{id:$('#create-id').value,title:$('#create-title').value,description:'An original universe created in the VOIDWARD workshop.',columns:Number($('#create-columns').value),rows:Number($('#create-rows').value),planetsPerSystem:draftPack().rules.planetsPerSystem,seed:state.seed,homes:$('#create-homes').value.split(',').map(Number),geography:$('#create-geography').value});workshopTab='map';workshopSystem=0;showWorkshop();break;
      case 'hull-add': if(hullDraft.length>=40)throw new Error('Hull limit: 40 vertices.');hullDraft.push([Number($('#vertex-x').value),Number($('#vertex-y').value)]);showWorkshop();break;
      case 'hull-undo': hullDraft.pop();showWorkshop();break;
      case 'hull-clear': hullDraft=[];showWorkshop();break;
      case 'hull-reset': hullDraft=structuredClone(draftPack().hulls[workshopHull].shape);showWorkshop();break;
      case 'hull-apply': editorFiles=Workshop.updateHull(editorFiles,workshopHull,{shape:hullDraft});showWorkshop();break;
      case 'visual-editor-draft': localStorage.setItem(INCOMING_KEY,Workshop.exportPack(editorFiles));location.href='editor/index.html?draft=voidward';break;
      case 'workbench-bundle-export': download(`${workshopHull}-hull-bundle.json`,await Bridge.exportWorkbenchHullBundle(editorFiles,workshopHull));break;
      case 'workbench-hull-import': $('#workbench-upload').dataset.mode='hull';$('#workbench-upload').click();break;
      case 'workbench-map-import': $('#workbench-upload').dataset.mode='map';$('#workbench-upload').click();break;
      case 'workbench-preview': bridgeEntity=$('#workbench-entity').value;bridgeResult=await Bridge.importWorkbench(bridgeText,{entityId:bridgeEntity});hullDraft=structuredClone(bridgeResult.shape);showWorkshop();break;
      case 'workbench-apply': editorFiles=Bridge.applyWorkbenchHull(editorFiles,workshopHull,bridgeResult);bridgeResult=null;hullDraft=null;showWorkshop();break;
      case 'workbench-hull-export': download(`${workshopHull}-workbench.json`,await Bridge.exportWorkbenchHull(editorFiles,workshopHull));break;
      case 'workbench-map-export': download(`${draftPack().meta.id}-layout-workbench.json`,Bridge.exportWorkbenchLayout(editorFiles));break;
      case 'settings': settingsDialog(); break;
      case 'undo': undoOrder(); break;
      case 'use-livery': setLivery(player(), d.id); render(); toast('Livery applied to your fleet.'); break;
      case 'livery-import': $('#livery-upload').click(); break;
      case 'livery-template': download('voidward-liveries.json', importedLiveries ? exportLiveryPack(importedLiveries.liveries, importedLiveries.id, importedLiveries.title, importedLiveries.author) : exportLiveryPack()); toast(importedLiveries ? 'Imported livery pack exported.' : 'Livery template exported. Edit it and import it from Settings.'); break;
      case 'livery-reset': importedLiveries = null; preferences.liveries = {}; try { localStorage.removeItem('voidward.liveries.v1'); } catch {} savePreferences(); settingsDialog(); toast('Liveries reset to automatic.'); break;
      case 'objectives': objectivesDialog(); break;
      case 'choose-objective': if (act({ type: 'chooseObjective', id: d.id })) objectivesDialog(); break;
      case 'reorder': act({ type: 'reorder', planet: Number(d.planet), from: Number(d.from), to: Number(d.to) }); manageColony(Number(d.planet)); break;
      case 'ship-orders': shipOrders(Number(d.id)); break;
      case 'ship-order': if (act({ type: 'order', fleet: Number(d.fleet), order: d.order, ...(d.order === 'patrol' ? { target: Number($('#order-target').value) } : {}) })) closeDialog(); break;
      case 'refit': if (act({ type: 'refit', fleet: Number(d.fleet), design: Number(d.design) })) { closeDialog(); toast('Refit ordered. The ship remains in the yard until work completes.'); } break;
      case 'group-prompt': modal('Form a task force', `<p>Selected ships must be in the same system and free of existing groups or refits. Orders travel together at the slowest member’s speed.</p><label>NAME<input id="group-name" maxlength="32" value="Frontier task force"></label><div class="row">${btn('Create task force','create-group','','primary')}</div>`); break;
      case 'create-group': if (act({ type: 'group', name: $('#group-name').value, fleets: [...selectedShips] })) { selectedShips.clear(); closeDialog(); render(); } break;
      case 'ungroup': act({ type: 'ungroup', group: Number(d.group) }); break;
      case 'group-orders': { const g=state.groups.find(g=>g.id===Number(d.group)),ship=state.fleets.find(f=>f.id===g.ships[0]); modal(esc(g.name), `<label>DESTINATION<select id="group-target">${destinationOptions(ship.system)}</select></label><div class="row">${btn('Plot task-force course','group-move',`data-group="${g.id}"`,'primary')}</div>`); break; }
      case 'group-move': if(act({type:'groupMove',group:Number(d.group),target:Number($('#group-target').value)})) closeDialog(); break;
      case 'close': closeDialog(); break;
      case 'end': requestEndTurn(); break;
      case 'end-confirmed': closeDialog(); act({type:'endTurn'}); break;
      case 'readiness': readinessDialog(); break;
      case 'command-menu': commandMenu(); break;
      case 'next-idle': nextIdleFleet(); break;
      case 'idle-colonies': closeDialog(); filters.colonies.mode='idle';filters.colonies.search='';view='colonies';render();break;
      case 'home': closeDialog();selected=pack.empires[player()].home;view='galaxy';render();revealSelection();break;
      case 'jump-system': closeDialog();selected=Number(d.id);view='galaxy';render();revealSelection();break;
      case 'system': selected = Number(d.id); render(); break;
      case 'select-fleet': selectedFleet = selectedFleet === Number(d.id) ? null : Number(d.id); render(); break;
      case 'fleet-on-map': { selectedFleet = Number(d.id); selected = state.fleets.find(f => f.id === selectedFleet).system; view = 'galaxy'; render();revealSelection();break; }
      case 'move': if (act(courseCommand(Number(d.target)))) toast('Course plotted. End the turn to engage warp.'); break;
      case 'hold': act({ type: 'hold', fleet: selectedFleet }); break;
      case 'colonize': act({ type: 'colonize', planet: Number(d.planet), fleet: Number(d.fleet) }); break;
      case 'manage': manageColony(Number(d.id)); break;
      case 'locate': selected = Number(d.id); view = 'galaxy'; render();revealSelection();break;
      case 'build': act({ type: 'build', planet: Number(d.planet), kind: d.kind }); manageColony(Number(d.planet)); break;
      case 'build-ship': act({ type: 'build', planet: Number(d.planet), kind: 'ship', design: Number(d.design) }); manageColony(Number(d.planet)); break;
      case 'cancel-build': act({ type: 'cancel', planet: Number(d.planet), index: Number(d.index) }); manageColony(Number(d.planet)); break;
      case 'research': act({ type: 'research', field: d.field }); break;
      case 'designer': view = 'designer'; render(); break;
      case 'mods': view = 'mods'; render(); break;
      case 'add-part': designer.parts.push(d.part); render(); break;
      case 'remove-part': designer.parts.splice(Number(d.index), 1); render(); break;
      case 'copy-design': { const source = d.fleet ? state.fleets.find(f => f.id === Number(d.fleet)).design : state.empires[player()].designs.find(x => x.id === Number(d.design)); designer = structuredClone(source); designer.name = (source.name + ' Mk II').slice(0, 32); view = 'designer'; render(); break; }
      case 'update-design': if(act({type:'updateDesign',design:{...designer,id:Number(d.design)}}))toast('Template updated. Existing ships and queued builds keep their snapshots.'); break;
      case 'save-design': if (act({ type: 'design', design: designer })) toast('Class registered. Build it at an orbital shipyard.'); break;
      case 'diplomacy': act({ type: 'diplomacy', target: Number(d.target), offer: d.offer }); closeDialog(); break;
      case 'war-prompt': modal('Declare war?', `<p>This breaks any trade pact with ${esc(pack.empires[Number(d.target)].name)}. Fleets and planets become hostile when turns resolve.</p><div class="row">${btn('Declare war', 'diplomacy', `data-target="${d.target}" data-offer="war"`, 'danger')}${btn('Keep the peace', 'close', '', 'quiet')}</div>`); break;
      case 'map-mode': mapMode = d.mode; render(); break;
      case 'zoom-in': zoomAt(1.2); break;
      case 'zoom-out': zoomAt(1 / 1.2); break;
      case 'zoom-reset': zoom = 1;mapPan={x:0,y:0};drawGalaxy();break;
      case 'pan-mode': panMode=!panMode;$('.chart-viewport')?.classList.toggle('pan-enabled',panMode);button.setAttribute('aria-pressed',String(panMode));button.classList.toggle('active',panMode);break;
      case 'help': help(); break;
      case 'sound': await audio.toggle(); render(); toast(audio.enabled ? 'Sound enabled · original procedural soundscape' : 'Sound muted'); break;
      case 'new': await newGameDialog(); break;
      case 'campaign-prompt': await newGameDialog(d.pack); break;
      case 'launch': { const seed = Number($('#new-seed').value), difficulty = $('#new-difficulty').value, id = $('#new-pack').value; if (!$('#new-seed').value.trim()) throw new Error('Enter a galaxy seed.'); const playerId = Number($('#new-player').value), data = id === 'custom' ? { pack, hooks: {}, extension: null } : await registered(id); await activate(data.pack, data.hooks, data.extension, null, seed, difficulty, playerId); toast('Expedition launched. The frontier awaits.'); break; }
      case 'resume-pack': { const data=await registered(d.pack),hash=await fingerprint(data.pack.raw),prefix=`voidward.save.v1.${data.pack.meta.id}@${data.pack.meta.version}.${hash}.${data.extension}`;const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>k===prefix||k.startsWith(prefix+'.empire-'));if(!keys.length)throw new Error('No saved expedition for this campaign yet.');if(keys.length===1){await importSave(localStorage.getItem(keys[0]));toast('Campaign resumed.');}else modal('Resume an empire',`<div class="stack">${keys.map(key=>{const save=JSON.parse(localStorage.getItem(key)),empire=save.state.player||0;return btn(`${esc(data.pack.empires[empire].name)} · turn ${save.state.turn}`,'resume-slot',`data-key="${esc(key)}"`,'small');}).join('')}</div>`);break; }
      case 'resume-slot': await importSave(localStorage.getItem(d.key));toast('Campaign resumed.');break;
      case 'saves': savesDialog(); break;
      case 'save-now': if (autoSave()) toast('Campaign saved in this browser.'); break;
      case 'export-save': download(`voidward-${pack.meta.id}-turn-${state.turn}.json`, encodeSaveEnvelope(saveEnvelope())); toast('Save exported.'); break;
      case 'import-save': $('#save-file').click(); break;
      case 'import-mod': $('#mod-files').click(); break;
      case 'export-pack': download(`${pack.meta.id}-campaign.json`, JSON.stringify({ kind: 'voidward.text-pack.v1', files: pack.raw }, null, 2)); toast('Portable text pack exported. The workshop can reopen it.'); break;
      case 'edit-pack': editPack(); break;
      case 'pack-apply': { editorFiles[$('#pack-file').value] = $('#pack-text').value; const candidate = parsePack(editorFiles); await activate(candidate, {}, null, null, state.seed); toast('Edited text campaign validated and started in its own save slot.'); break; }
      case 'pack-download-file': editorFiles[$('#pack-file').value] = $('#pack-text').value; download($('#pack-file').value, $('#pack-text').value, 'text/plain'); break;
      case 'import-pack-json': $('#pack-json').click(); break;
    }
  } catch (error) { if (button.dataset.action?.startsWith('workshop-') || button.dataset.action?.startsWith('hull-') || button.dataset.action?.startsWith('workbench-')) workshopFailure(error); else toast(error.message, true); }
});
let editorFiles = null, editingFile = 'campaign.txt';
function editPack() {
  editorFiles = structuredClone(pack.raw); editingFile = 'campaign.txt';
  modal('Campaign text editor', `<p>Editing creates a data-only campaign with its own save slot. Local source hooks are not attached to text imports. Change the ID and version in campaign.txt before sharing.</p><div class="stack" style="margin-top:18px"><label>TEXT FILE<select id="pack-file">${allPackFiles().map(n => `<option value="${n}.txt">${n}.txt</option>`).join('')}</select></label><label>CONTENTS<textarea id="pack-text" spellcheck="false">${esc(editorFiles[editingFile] || '')}</textarea></label></div><div class="row wrap">${btn('Validate & start edited campaign', 'pack-apply', '', 'primary small')}${btn('Download this .txt', 'pack-download-file', '', 'small')}${btn('Open portable pack', 'import-pack-json', '', 'quiet small')}</div><input type="file" id="pack-json" accept=".json,application/json" hidden>`);
}
document.addEventListener('click',event=>{
  if(event.target.id!=='workshop-hull-canvas')return;
  if(hullDraft.length>=40){workshopFailure(new Error('Hull limit: 40 vertices.'));return;}
  const c=event.target,r=c.getBoundingClientRect();
  const x=Math.round(((event.clientX-r.left)/r.width*c.width-c.width/2)/2),y=Math.round(((event.clientY-r.top)/r.height*c.height-c.height/2)/2);
  hullDraft.push([Math.max(-60,Math.min(60,x)),Math.max(-60,Math.min(60,y))]);showWorkshop();
});
document.addEventListener('input', event => {
  const t=event.target;
  if(t.id==='design-name') designer.name=t.value;
  if(t.id==='command-search') $('#command-results').innerHTML=systemResults(t.value);
  if(t.dataset.filter && t.dataset.key==='search') { filters[t.dataset.filter].search=t.value; render(); }
  if(['music-volume','effects-volume'].includes(t.id)) {
    preferences.music=Number($('#music-volume').value)/100; preferences.effects=Number($('#effects-volume').value)/100;
    audio.setLevels(preferences.music,preferences.effects); savePreferences();
    $('#music-output').textContent=Math.round(preferences.music*100)+'%'; $('#effects-output').textContent=Math.round(preferences.effects*100)+'%';
  }
});
document.addEventListener('change', async event => {
  try {
    const t=event.target;
    if(t.id==='workshop-hull'){workshopHull=t.value;hullDraft=null;bridgeResult=null;showWorkshop();}
    if(t.id==='workshop-table'){workshopTable=t.value;workshopRow=0;showWorkshop();}
    if(t.id==='workshop-row'){workshopRow=Number(t.value);showWorkshop();}
    if(t.id==='visual-pack-file'){editingFile=t.value;$('#visual-pack-text').value=editorFiles[editingFile]||'';}
    if(t.id==='workshop-upload'){const file=t.files[0];if(!file)return;if(file.size>1000000)throw new Error('Pack exceeds 1 MB.');editorFiles=Workshop.importPack(await file.text());workshopSystem=0;workshopHull=null;hullDraft=null;showWorkshop();}
    if(t.id==='workbench-upload'){const file=t.files[0];if(!file)return;if(file.size>1000000)throw new Error('Workbench project exceeds 1 MB.');const text=await file.text();if(t.dataset.mode==='map'){editorFiles=Bridge.importWorkbenchLayout(editorFiles,text);showWorkshop();}else{Bridge.inspectWorkbench(text);bridgeText=text;bridgeResult=null;bridgeEntity=null;showWorkshop();}}
    if(t.dataset.filter && t.dataset.key!=='search') { filters[t.dataset.filter][t.dataset.key]=t.value; render(); }
    if(t.dataset.shipSelect) { t.checked?selectedShips.add(Number(t.dataset.shipSelect)):selectedShips.delete(Number(t.dataset.shipSelect)); render(); }
    if(t.id==='compare-design') { compareDesign=Number(t.value); render(); }
    if(t.id==='audio-enabled') { await audio.setEnabled(t.checked); render(); }
    if(t.id==='motion-setting') { preferences.motion=t.value; document.documentElement.dataset.motion=t.value; savePreferences(); }
    if(t.id==='label-setting') { preferences.labels=t.value;savePreferences();drawGalaxy(); }
    if(t.id==='contrast-setting') { preferences.contrast=t.value;document.documentElement.dataset.contrast=t.value;savePreferences(); }
    if(t.id==='review-turn') { preferences.reviewTurn=t.checked;savePreferences(); }
    if(t.id==='theme-setting' && THEMES.includes(t.value)) { preferences.theme=t.value;document.documentElement.dataset.theme=t.value;savePreferences(); }
    if(t.id==='minimap-setting') { preferences.minimap=t.checked;savePreferences();const m=$('#minimap');if(m){m.hidden=!t.checked;drawGalaxy();} }
    if(t.id==='music-mode') { preferences.musicMode=t.value==='e8'?'e8':'pack';savePreferences();audio.setMode(preferences.musicMode); }
    if(t.id==='detail-setting' && DETAILS.includes(t.value)) { preferences.detail=t.value;savePreferences();drawGalaxy(); }
    if(t.dataset.livery!==undefined) { setLivery(Number(t.dataset.livery),t.value);paintCanvases($('#dialog')); }
    if(t.id==='design-livery') { setLivery(player(),t.value);render(); }
    if(t.id==='livery-upload') { const file=t.files[0];if(!file)return;if(file.size>LIVERY_PACK_BYTES)throw new Error(`Livery pack exceeds ${LIVERY_PACK_BYTES} bytes.`);const text=await file.text();importedLiveries=compileLiveryPack(text);try{localStorage.setItem('voidward.liveries.v1',text);}catch{}savePreferences();settingsDialog();toast(`Livery pack loaded: ${importedLiveries.title}.`);t.value='';return; }
    if(t.id==='system-jump') { selected=Number(t.value);render();revealSelection(); }
    if (event.target.id === 'design-hull') { designer.hull = event.target.value; render(); }
    if(t.id==='new-pack') { await changeNewCampaign(t.value);return; }
    if(t.id==='new-player' && newCandidate) refreshBriefing(newCandidate);
    if (event.target.id === 'pack-file') { editorFiles[editingFile] = $('#pack-text').value; editingFile = event.target.value; $('#pack-text').value = editorFiles[editingFile] || ''; }
    if (event.target.id === 'pack-json') { const file = event.target.files[0]; if (!file) return; if (file.size > 1000000) throw new Error('Pack exceeds 1 MB.'); const data = JSON.parse(await file.text()); if (data.kind !== 'voidward.text-pack.v1') throw new Error('Unknown campaign format.'); const parsed = parsePack(data.files); editorFiles = parsed.raw; editingFile = 'campaign.txt'; $('#pack-file').value = editingFile; $('#pack-text').value = editorFiles[editingFile] || ''; toast('Text pack loaded into the editor. Validate & start to play.'); }
    if (event.target.id === 'save-file') { const file = event.target.files[0]; if (!file) return; if (file.size > MAX_SAVE_BYTES) throw new Error('Save exceeds the 49 MiB UTF-8 limit.'); await importSave(await file.text()); toast('Save verified and restored.'); event.target.value = ''; }
    if (event.target.id === 'mod-files') { if (!event.target.files.length) return; const candidate = await loadDirectory(event.target.files); await activate(candidate, {}, null); toast(`Campaign loaded: ${candidate.meta.title}`); event.target.value = ''; }
  } catch (error) { event.target.value = ''; toast(error.message, true); }
});
document.addEventListener('pointerdown', event => {
  if(event.target.id==='minimap' && state) {
    const mini=event.target,canvas=$('#galaxy-canvas'),rect=mini.getBoundingClientRect();if(!canvas)return;
    const miniT=chartTransform(state.systems,mini.clientWidth,mini.clientHeight,1,{}),mainT=chartTransform(state.systems,canvas.clientWidth,canvas.clientHeight,zoom,mapPan);
    if(!miniT||!mainT)return;
    const dx=(event.clientX-rect.left-mini.clientWidth/2)/miniT.scale,dy=(event.clientY-rect.top-mini.clientHeight/2)/miniT.scale;
    mapPan={x:-dx*mainT.scale,y:-dy*mainT.scale};scheduleMapDraw();event.preventDefault();return;
  }
  const area=event.target.closest('.chart-viewport');
  if(!area || event.button!==0 || event.target.closest('button') || (event.pointerType==='touch' && !panMode))return;
  mapDrag={id:event.pointerId,area,x:event.clientX,y:event.clientY,pan:{...mapPan}};
  area.setPointerCapture(event.pointerId);area.classList.add('dragging');event.preventDefault();
});
document.addEventListener('pointermove',event=>{
  if(!mapDrag || mapDrag.id!==event.pointerId)return;
  const limit=Math.max(mapDrag.area.clientWidth,mapDrag.area.clientHeight)*4;
  mapPan={x:Math.max(-limit,Math.min(limit,mapDrag.pan.x+event.clientX-mapDrag.x)),y:Math.max(-limit,Math.min(limit,mapDrag.pan.y+event.clientY-mapDrag.y))};
  scheduleMapDraw();event.preventDefault();
});
function stopMapDrag(event) {
  if(!mapDrag || event.pointerId!==undefined && mapDrag.id!==event.pointerId)return;
  const {area,id}=mapDrag;mapDrag=null;area.classList.remove('dragging');
  if(area.hasPointerCapture(id))area.releasePointerCapture(id);
}
document.addEventListener('pointerup',stopMapDrag);
document.addEventListener('pointercancel',stopMapDrag);
document.addEventListener('lostpointercapture',stopMapDrag);
document.addEventListener('focusin',event=>{
  const star=event.target.closest('.star-node');
  if(star && view==='galaxy'){revealSelection(Number(star.dataset.id));showMapTip(star);}
});
document.addEventListener('focusout',event=>{ if(event.target.closest?.('.star-node'))hideMapTip(); });
document.addEventListener('mouseover',event=>{ const star=event.target.closest?.('.star-node'); if(star)showMapTip(star); });
document.addEventListener('mouseout',event=>{ const star=event.target.closest?.('.star-node'); if(star && !star.contains(event.relatedTarget))hideMapTip(); });
document.addEventListener('wheel',event=>{
  if(!state || !event.target.closest?.('.chart-viewport') || $('#dialog').open)return;
  event.preventDefault();zoomAt(event.deltaY<0?1.15:1/1.15,event.clientX,event.clientY);
},{passive:false});
document.addEventListener('keydown', event => {
  if(event.repeat || !state || event.isComposing || $('#dialog').open)return;
  if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='k') { event.preventDefault();commandMenu();return; }
  if((event.ctrlKey||event.metaKey) && !event.shiftKey && event.key.toLowerCase()==='z' && !event.target.isContentEditable && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) { event.preventDefault();undoOrder();return; }
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
  const star=event.target.closest('.star-node'),vectors={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(star && vectors[event.key]) {
    event.preventDefault();const c=$('#galaxy-canvas'),points=mapProjection(state.systems,c.clientWidth,c.clientHeight,zoom,mapPan),origin=points[Number(star.dataset.id)],[dx,dy]=vectors[event.key];
    const candidates=[...engine.visibleSystems(state)].map(id=>({id,x:points[id].x-origin.x,y:points[id].y-origin.y})).filter(p=>p.x*dx+p.y*dy>1);
    candidates.sort((a,b)=>(Math.hypot(a.x,a.y)+Math.abs(a.x*dy-a.y*dx)*2)-(Math.hypot(b.x,b.y)+Math.abs(b.x*dy-b.y*dx)*2)||a.id-b.id);
    if(candidates.length){selected=candidates[0].id;render();revealSelection();$(`.star-node[data-id="${selected}"]`)?.focus({preventScroll:true});}return;
  }
  if(['BUTTON','A'].includes(event.target.tagName))return;
  const key=event.key.toLowerCase();
  if(key==='e'){event.preventDefault();requestEndTurn();}
  else if(key==='n'){event.preventDefault();nextIdleFleet();}
  else if(key==='c'){event.preventDefault();nextIdleColony();}
  else if(key==='+'||key==='='){event.preventDefault();zoomAt(1.2);}
  else if(key==='-'||key==='_'){event.preventDefault();zoomAt(1/1.2);}
  else if(key==='0'){event.preventDefault();zoom=1;mapPan={x:0,y:0};scheduleMapDraw();}
  else if(key==='h'){event.preventDefault();selected=pack.empires[player()].home;view='galaxy';render();revealSelection();}
  else if(key==='/'){event.preventDefault();commandMenu();}
  else if(key==='escape' && selectedFleet!==null){selectedFleet=null;render();}
  else if(event.key==='?')help();
  const index=Number(event.key)-1;if(index>=0&&index<8){view=['galaxy','colonies','fleets','research','designer','diplomacy','reports','mods'][index];render();}
});

function pollGamepad() {
  if (!state || document.hidden || !document.hasFocus() || $('#dialog').open) return;
  gamepad.poll(); const B = globalThis.QsolInput.BUTTON;
  if (gamepad.pressed(B.EAST)) { selectedFleet = null; render(); }
  if (view !== 'galaxy') return;
  if (gamepad.pressed(B.RB)) zoomAt(1.2); if (gamepad.pressed(B.LB)) zoomAt(1 / 1.2);
  const ids = [...engine.visibleSystems(state)].sort((a, b) => a - b), current = ids.indexOf(selected);
  if (gamepad.pressed(B.RIGHT) || gamepad.pressed(B.DOWN)) { selected = ids[(current + 1) % ids.length]; render();revealSelection(); }
  if (gamepad.pressed(B.LEFT) || gamepad.pressed(B.UP)) { selected = ids[(current - 1 + ids.length) % ids.length]; render();revealSelection(); }
  if (gamepad.pressed(B.SOUTH)) { if (selectedFleet) act(courseCommand(selected)); else { selectedFleet = engine.fleets(state).find(f => f.system === selected)?.id || null; render(); } }
}
window.addEventListener('blur', () => { stopMapDrag({});gamepad.reset(); audio.suspend(); });
window.addEventListener('focus', () => { gamepad.reset(); audio.resume(); });
document.addEventListener('visibilitychange', () => { gamepad.reset(); document.hidden ? audio.suspend() : audio.resume(); });
$('#dialog').addEventListener('close', () => { campaignLoadEpoch++;newCandidate=null;gamepad.reset(); restoreFocus(returnFocus); returnFocus = null; });
async function boot() {
  let restoreError = '', incoming = null;
  if (new URL(location.href).searchParams.get('draft') === 'editor') {
    try {
      const text = localStorage.getItem(HANDOFF_KEY);
      if (!text) throw new Error('No pending editor draft. Export a campaign file and import it in the workshop.');
      incoming = parsePack(Workshop.importPack(text));
    } catch (error) { restoreError = `Editor draft rejected: ${error.message}`; }
  }
  let restored = false;
  try { const key = localStorage.getItem('voidward.active.v1'), saved = key && localStorage.getItem(key); if (saved) { await importSave(saved); restored = true; } }
  catch (error) { restoreError += ` Previous save could not be restored: ${error.message}`; }
  if (!restored) { const data = await registered('frontier'); await activate(data.pack, data.hooks, data.extension); }
  if (incoming) {
    openWorkshop(incoming);
    localStorage.removeItem(HANDOFF_KEY);
    const url = new URL(location.href); url.searchParams.delete('draft'); history.replaceState(null,'',url);
    toast('Workbench draft ready. Review it, then choose Launch draft campaign and your empire.');
  }
  if (restoreError) toast(restoreError, true);
}
boot().then(() => {
  gamepadTimer = setInterval(pollGamepad, 80);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(error => toast('Offline cache unavailable: ' + error.message, true));
}).catch(error => { $('#app').innerHTML = `<div class="loading"><h1>Unable to open the frontier</h1><p>${esc(error.message)}</p><p>Serve this folder over HTTP. See README.md for local play.</p><button onclick="location.reload()">Retry</button></div>`; });
// Read-only snapshots for diagnostics: external code cannot mutate the live campaign.
Object.defineProperty(globalThis, '__voidward', { get: () => state ? { state: structuredClone(state), player: player(), pack: structuredClone(pack), view, selected, selectedFleet, audio: { enabled: audio.enabled, context: audio.effects.ctx?.state, cachedNotes: audio.notes.size, noteBytes: audio.noteBytes, levels: audio.levels, musicVoices: audio.sources.size }, renderer: {...backdropStats(),zoom,pan:{...mapPan},mode:mapMode,detail:preferences.detail}, presentation: { theme: preferences.theme, liveries: {...preferences.liveries}, playerLivery: playerLivery().id, importedLiveries: importedLiveries?.id ?? null, minimap: preferences.minimap, music: audio.mode, undo: undoStack.length }, workshop: editorFiles ? { files: structuredClone(editorFiles), tab: workshopTab, hull: workshopHull } : null, engineVersion: 2 } : null });
