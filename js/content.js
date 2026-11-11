// SPDX-License-Identifier: Apache-2.0
// Text packs are data. They never evaluate JavaScript, HTML, URLs or expressions.
export const PACK_FILES = ['campaign', 'rules', 'empire_names', 'empires', 'system_names', 'planet_names', 'planet_types', 'hulls', 'components', 'ships', 'buildings', 'research', 'map', 'music'];
const bad = message => { throw new Error(`Campaign pack: ${message}`); };
const lines = text => text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const validId = s => typeof s === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(s) && !['constructor', 'prototype', '__proto__'].includes(s);
const number = (s, min, max, label) => { if (!/^\d+$/.test(String(s)) || !Number.isSafeInteger(Number(s)) || Number(s) < min || Number(s) > max) bad(`${label} must be ${min}..${max}.`); return Number(s); };
function table(raw, file, fields) {
  return lines(raw[file + '.txt']).map((line, i) => {
    const cells = line.split('|').map(s => s.trim());
    if (cells.length !== fields.length) bad(`${file}.txt:${i + 1} expects ${fields.length} pipe-separated fields.`);
    return Object.fromEntries(fields.map((key, j) => [key, cells[j]]));
  });
}
function settings(text) {
  const result = Object.create(null);
  for (const line of lines(text)) {
    const at = line.indexOf('='); if (at <= 0) bad('Settings use key = value.');
    const key = line.slice(0, at).trim(), value = line.slice(at + 1).trim();
    if (Object.hasOwn(result, key) || ['constructor', 'prototype', '__proto__'].includes(key)) bad('Duplicate or reserved setting.');
    result[key] = value;
  }
  return result;
}
function catalog(records, file) {
  const out = Object.create(null);
  if (!records.length || records.length > 128) bad(`${file} requires 1..128 records.`);
  for (const r of records) { if (!validId(r.id) || Object.hasOwn(out, r.id)) bad(`Invalid or duplicate ID in ${file}.`); out[r.id] = r; }
  return out;
}
export function parsePack(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Expected a text file collection.');
  const raw = {};
  for (const file of PACK_FILES) {
    const value = input[file + '.txt'];
    if (typeof value !== 'string' || value.length > 100000 || value.includes('\0')) bad(`Missing or oversized ${file}.txt.`);
    raw[file + '.txt'] = value;
  }
  if (JSON.stringify(raw).length > 500000) bad('Combined pack exceeds 500 KB.');
  const meta = settings(raw['campaign.txt']);
  if (Object.keys(meta).length !== 4 || !['id', 'version', 'title', 'description'].every(k => Object.hasOwn(meta, k))) bad('campaign.txt needs exactly id, version, title and description.');
  if (!validId(meta.id) || !/^\d+\.\d+\.\d+$/.test(meta.version) || !meta.title || meta.title.length > 80 || !meta.description || meta.description.length > 600) bad('Invalid campaign identity.');
  const r = settings(raw['rules.txt']);
  const limits = {
    columns: [2, 10], rows: [2, 8], planetsPerSystem: [1, 4], turnLimit: [20, 500], colonyTarget: [2, 200], maxTech: [2, 8],
    startMinerals: [0, 100000], startEnergy: [0, 100000], colonizeMinerals: [0, 10000], colonizeEnergy: [0, 10000],
    baseProduction: [1, 100], industryProduction: [0, 100], industryMinerals: [0, 100], baseEnergy: [0, 100], baseScience: [1, 100],
    baseDefence: [0, 200], shieldDefence: [0, 100], researchBase: [1, 10000], researchStep: [1, 10000],
    tradeIncome: [0, 1000], tradeCost: [0, 10000], peaceCost: [0, 10000], warGrace: [1, 200],
    relicScience: [0, 10000], relicMinerals: [0, 10000], repair: [0, 100], facilityLimit: [1, 10], fleetLimit: [3, 60]
  };
  const rules = {};
  for (const [key, bounds] of Object.entries(limits)) rules[key] = number(r[key], ...bounds, key);
  if (Object.keys(r).some(key => !Object.hasOwn(limits, key))) bad('Unknown rule key.');
  const count = rules.columns * rules.rows;
  if (count > 64 || rules.colonyTarget > count * rules.planetsPerSystem) bad('Galaxy capacity exceeded.');
  const empireNames = lines(raw['empire_names.txt']), systemNames = lines(raw['system_names.txt']), planetNames = lines(raw['planet_names.txt']);
  if (systemNames.length < count || planetNames.length < count * rules.planetsPerSystem) bad('Provide enough system and planet names for the galaxy.');
  for (const n of [...empireNames, ...systemNames, ...planetNames]) if (n.length > 60) bad('Names must have at most 60 characters.');
  const empires = table(raw, 'empires', ['id', 'short', 'color', 'accent', 'home', 'ethos']);
  if (empires.length < 2 || empires.length > 6 || empireNames.length !== empires.length) bad('Use 2..6 empires and one name per empire.');
  empires.forEach((e, i) => {
    e.id = number(e.id, 0, 5, 'empire id'); e.home = number(e.home, 0, count - 1, 'home system'); e.name = empireNames[i];
    if (e.id !== i || !/^#[\da-f]{6}$/i.test(e.color) || !/^#[\da-f]{6}$/i.test(e.accent) || !e.short || e.short.length > 15 || e.ethos.length > 150) bad('Invalid empire row.');
  });
  if (new Set(empires.map(e => e.home)).size !== empires.length) bad('Empires need distinct home systems.');
  const tech = catalog(table(raw, 'research', ['id', 'name', 'desc']), 'research');
  for (const id of ['industry', 'propulsion', 'weapons', 'shields']) if (!Object.hasOwn(tech, id)) bad(`Required research field: ${id}.`);
  const planets = catalog(table(raw, 'planet_types', ['id', 'name', 'max', 'minerals', 'palette']), 'planet types');
  for (const p of Object.values(planets)) { p.max = number(p.max, 20, 1000, 'population'); p.minerals = number(p.minerals, 0, 200, 'minerals'); if (!['ocean', 'gas', 'ice'].includes(p.palette)) bad('Planet palette must be ocean, gas or ice.'); }
  const hulls = catalog(table(raw, 'hulls', ['id', 'name', 'faction', 'slots', 'hp', 'cost', 'work', 'tech', 'level', 'shape']), 'hulls');
  for (const h of Object.values(hulls)) {
    h.faction = h.faction === '*' ? -1 : number(h.faction, 0, empires.length - 1, 'hull faction');
    for (const [key, min, max] of [['slots', 2, 40], ['hp', 1, 1000], ['cost', 1, 10000], ['work', 1, 10000], ['level', 1, rules.maxTech]]) h[key] = number(h[key], min, max, key);
    if (!Object.hasOwn(tech, h.tech)) bad('Unknown hull research field.');
    h.shape = h.shape.split(';').map(point => point.trim().split(',').map(Number));
    if (h.shape.length < 3 || h.shape.length > 40 || h.shape.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 60))) bad('Hull shape needs 3..40 x,y vertices in -60..60.');
  }
  const components = catalog(table(raw, 'components', ['id', 'name', 'kind', 'slots', 'cost', 'hp', 'attack', 'speed', 'tech', 'level', 'description']), 'components');
  for (const c of Object.values(components)) {
    if (!['engine', 'weapon', 'shield', 'survey', 'colony', 'assault'].includes(c.kind) || !Object.hasOwn(tech, c.tech)) bad('Unknown component role or research.');
    for (const [key, min, max] of [['slots', 1, 20], ['cost', 0, 10000], ['hp', 0, 1000], ['attack', 0, 500], ['speed', 0, 4], ['level', 1, rules.maxTech]]) c[key] = number(c[key], min, max, key);
    if ((c.kind === 'engine') !== (c.speed > 0)) bad('Only engines provide movement, at least one lane per turn.');
  }
  const buildings = catalog(table(raw, 'buildings', ['id', 'name', 'cost', 'work', 'minerals', 'energy', 'science', 'production', 'defence', 'desc']), 'buildings');
  for (const id of ['mine', 'reactor', 'lab', 'yard', 'defence']) if (!Object.hasOwn(buildings, id)) bad(`Required facility: ${id}.`);
  for (const b of Object.values(buildings)) for (const key of ['cost', 'work', 'minerals', 'energy', 'science', 'production', 'defence']) b[key] = number(b[key], key === 'work' || key === 'cost' ? 1 : 0, 10000, `building ${key}`);
  const ships = table(raw, 'ships', ['empire', 'name', 'hull', 'parts']);
  if (ships.length > 60) bad('At most 60 starting ship records.');
  for (const ship of ships) {
    ship.empire = number(ship.empire, 0, empires.length - 1, 'ship empire'); ship.parts = ship.parts.split(',').map(s => s.trim());
    if (!ship.name || ship.name.length > 32 || !Object.hasOwn(hulls, ship.hull) || ship.parts.some(id => !Object.hasOwn(components, id))) bad('Invalid starting ship.');
    const h = hulls[ship.hull];
    if ((h.faction !== -1 && h.faction !== ship.empire) || h.level !== 1 || ship.parts.some(id => components[id].level !== 1) || ship.parts.reduce((n, id) => n + components[id].slots, 0) > h.slots || !ship.parts.some(id => components[id].speed > 0)) bad('Starting ships must be legal at technology I.');
  }
  for (const e of empires) for (const kind of ['colony', 'survey', 'assault']) if (!ships.some(s => s.empire === e.id && s.parts.some(id => components[id].kind === kind))) bad(`Empire ${e.id} needs a starting ${kind} ship.`);
  for (const e of empires) if (ships.filter(s => s.empire === e.id).length > Math.min(24, rules.fleetLimit)) bad('Starting ships exceed the design or fleet capacity.');
  const map = table(raw, 'map', ['id', 'links', 'relic']);
  if (map.length !== count) bad('map.txt needs one row per star.');
  map.forEach((s, i) => {
    s.id = number(s.id, 0, count - 1, 'map id'); s.relic = number(s.relic, 0, 1, 'relic') === 1;
    s.links = s.links ? s.links.split(',').map(n => number(n, 0, count - 1, 'starlane')).sort((a, b) => a - b) : [];
    if (s.id !== i || new Set(s.links).size !== s.links.length || s.links.includes(i)) bad('Invalid starlane.');
  });
  for (const s of map) for (const n of s.links) if (!map[n].links.includes(s.id)) bad('Starlanes must be reciprocal.');
  const seen = new Set([0]); for (const id of seen) for (const n of map[id].links) seen.add(n);
  if (seen.size !== count) bad('Galaxy must be connected.');
  const music = table(raw, 'music', ['note', 'duration']);
  if (!music.length || music.length > 32) bad('Use 1..32 ambient notes.');
  music.forEach(n => { n.note = number(n.note, 24, 96, 'MIDI note'); n.duration = number(n.duration, 1, 8, 'note seconds'); });
  for (const record of [...Object.values(hulls), ...Object.values(components), ...Object.values(buildings), ...Object.values(tech), ...Object.values(planets)]) for (const [k, v] of Object.entries(record)) if (typeof v === 'string' && v.length > (k === 'desc' || k === 'description' ? 300 : 80)) bad('Catalog text exceeds its bound.');
  return { meta: { id: meta.id, version: meta.version, title: meta.title, description: meta.description }, rules, empires, systemNames, planetNames, planets, hulls, components, ships, buildings, tech, map, music, raw };
}
export async function loadPack(base) {
  const raw = {};
  await Promise.all(PACK_FILES.map(async name => {
    const response = await fetch(new URL(`${name}.txt`, base));
    if (!response.ok) throw new Error(`Cannot load ${name}.txt (${response.status}).`);
    raw[name + '.txt'] = await response.text();
  }));
  return parsePack(raw);
}
export async function loadDirectory(files) {
  const raw = {};
  for (const file of files) {
    const name = file.name;
    if (!PACK_FILES.some(n => n + '.txt' === name)) continue;
    if (Object.hasOwn(raw, name)) bad(`Duplicate ${name}; select a single campaign directory.`);
    if (file.size > 100000) bad('File exceeds 100 KB.');
    raw[name] = await file.text();
  }
  return parsePack(raw);
}
