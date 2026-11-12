// SPDX-License-Identifier: Apache-2.0
// Fleet liveries are cosmetic. They colour and pattern ship silhouettes without
// touching hull polygons, designs, saves or the authoritative campaign state.
// Validation reuses DRONE-RACER's capability-rejecting plain-data readers; the
// catalogue/JSON-pack contract adapts its DRONE-003 skin system.
import { record, list, bounded, label, identifier, color, freeze } from '../vendor/drone-racer/src/data.js';

export const LIVERY_PACK_KIND = 'voidward.liveries.v1';
export const LIVERY_PACK_BYTES = 16384;
export const PATTERNS = freeze(['plates', 'ribs', 'lattice', 'smooth', 'hex', 'stripes']);
export const TRIMS = freeze(['none', 'racing', 'chevron', 'bands', 'wedge']);
export const FLAMES = freeze(['plasma', 'ion', 'ember']);
const FIELDS = ['id', 'name', 'description', 'hull', 'pattern', 'trim', 'flame', 'glow', 'wear'];

function livery(id, name, description, hull, pattern, trim, flame, glow, wear) {
  return { id, name, description, hull, pattern, trim, flame, glow, wear };
}
export const BUILTIN_LIVERIES = freeze([
  livery('standard', 'Fleet standard', 'Blue-grey alloy plating with a faction racing stripe.', ['#93aab8', '#4a6576', '#253f50', '#091723'], 'plates', 'racing', 'plasma', .4, 0),
  livery('ceramic', 'Ceramic white', 'Smooth ablative ceramics with twin faction bands.', ['#f4f7f9', '#c9d4dc', '#8c9fab', '#3a4a56'], 'smooth', 'bands', 'ion', .25, 0),
  livery('obsidian', 'Obsidian stealth', 'Low-albedo hex tiling with a faction nose wedge.', ['#3d4752', '#1e262d', '#0e1317', '#04070a'], 'hex', 'wedge', 'ion', .2, 0),
  livery('gilded', 'Gilded relic', 'Ribbed bronze plating weathered by long voyages.', ['#f3dca3', '#bb8e48', '#6f4f24', '#2a1c0c'], 'ribs', 'bands', 'ember', .5, .3),
  livery('foundry', 'Foundry hazard', 'Industrial grey hull with hazard stripes and chevrons.', ['#bcc3c9', '#78818a', '#3e464d', '#15191d'], 'stripes', 'chevron', 'ember', .35, .5),
  livery('verdant', 'Verdant lattice', 'Living composite lattice in pale green.', ['#bfe9cf', '#62b08a', '#2f6c57', '#0e2b25'], 'lattice', 'racing', 'ion', .45, 0),
  livery('crimson', 'Crimson vanguard', 'Red oxide plating with assault chevrons.', ['#f2a692', '#ac4433', '#621f18', '#200907'], 'plates', 'chevron', 'ember', .5, .15),
  livery('nebula', 'Nebula iridescent', 'Violet iridescent lattice with a bright nose wedge.', ['#dac9ff', '#9376dc', '#4e3c92', '#1b1242'], 'lattice', 'wedge', 'plasma', .6, 0)
]);

export function compileLivery(source) {
  const v = record(source, FIELDS);
  identifier(v.id); label(v.name, 48); label(v.description, 120);
  const hull = list(v.hull, 4, 4).map(color);
  if (!PATTERNS.includes(v.pattern) || !TRIMS.includes(v.trim) || !FLAMES.includes(v.flame)) throw new TypeError('unknown livery pattern, trim or flame');
  return freeze({ id: v.id, name: v.name, description: v.description, hull, pattern: v.pattern, trim: v.trim, flame: v.flame, glow: bounded(v.glow, 0, 1), wear: bounded(v.wear, 0, 1) });
}
// A livery pack is inert data: colours, named pattern choices and two bounded
// numbers. Unknown fields, accessors, sparse arrays and oversized text are rejected.
export function compileLiveryPack(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIVERY_PACK_BYTES) throw new RangeError(`Livery pack exceeds ${LIVERY_PACK_BYTES} bytes.`);
  const s = record(JSON.parse(text), ['kind', 'version', 'id', 'title', 'author', 'liveries']);
  if (s.kind !== LIVERY_PACK_KIND || s.version !== 1) throw new TypeError('voidward.liveries.v1 pack required');
  identifier(s.id); label(s.title); label(s.author);
  const seen = new Set();
  const liveries = list(s.liveries, 1, 16).map(raw => { const l = compileLivery(raw); if (seen.has(l.id)) throw new TypeError('duplicate livery ID'); seen.add(l.id); return l; });
  return freeze({ id: s.id, title: s.title, author: s.author, liveries });
}
export function exportLiveryPack(liveries = BUILTIN_LIVERIES, id = 'my-hangar', title = 'My hangar', author = 'Commander') {
  return JSON.stringify({ kind: LIVERY_PACK_KIND, version: 1, id, title, author, liveries: liveries.map(l => ({ ...l, hull: [...l.hull] })) }, null, 2);
}
// Imported liveries may replace a built-in of the same ID; the catalogue order is stable.
export function liveryCatalogue(imported = null) {
  const byId = new Map(BUILTIN_LIVERIES.map(l => [l.id, l]));
  for (const l of imported?.liveries || []) byId.set(l.id, l);
  return [...byId.values()];
}
export function hashText(text) {
  let hash = 2166136261;
  for (const ch of String(text)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return hash >>> 0;
}
// Automatic assignment depends only on the empire's own text, so a faction looks
// the same in every browser and after every reload without a saved preference.
export function autoLivery(empire, catalogue = BUILTIN_LIVERIES) {
  return catalogue[hashText(`${empire.short}|${empire.ethos}`) % catalogue.length];
}
export function liveryFor(empire, pack, selections = {}, imported = null) {
  const catalogue = liveryCatalogue(imported), choice = selections[`${pack.meta.id}/${empire.id}`];
  return catalogue.find(l => l.id === choice) || autoLivery(empire, catalogue);
}
