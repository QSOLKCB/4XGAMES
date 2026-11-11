// SPDX-License-Identifier: Apache-2.0
// Authoritative campaign state: integer resources, seeded decisions, explicit turns.
import { nextRandom, mulDiv, add } from '../vendor/vanillajs/modules/integer-math/index.js';

import { ExactRational } from '../vendor/vanillajs/modules/exact-rational/index.js';
import { ExactGraph, breadthFirst, MAX_VERTICES } from '../vendor/vanillajs/modules/exact-graph/index.js';

export function createEngine(content, hooks = {}) {
const { rules: R, empires: FACTIONS, tech: TECH, hulls: HULLS, components: COMPONENTS, buildings: BUILDINGS, planets: PLANET_TYPES } = content;
const VERSION = 1, TURN_LIMIT = R.turnLimit, COLONY_TARGET = R.colonyTarget;
const N = content.map.length, E = FACTIONS.length, P = R.planetsPerSystem;
const NAMES = content.systemNames;
const fail = message => { throw new Error(message); };
const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
function random(state, bound) { state.rng = nextRandom(state.rng); return mulDiv(state.rng >>> 1, bound, 2147483647) % bound; }
const colonies = (state, owner = 0) => state.planets.filter(p => p.owner === owner);
const fleets = (state, owner = 0) => state.fleets.filter(f => f.owner === owner);
const systemOf = (state, planet) => state.systems[planet.system];
const atWar = (state, a, b) => a !== b && state.relations[a][b] === 'war';
const techCost = level => R.researchBase + level * level * R.researchStep;
function log(state, text, kind = 'info') {
  state.log.unshift({ turn: state.turn, text, kind });
  state.log.length = Math.min(state.log.length, 100);
}
function reveal(state, owner, id) {
  const e = state.empires[owner];
  if (!e.known.includes(id)) {
    e.known.push(id); e.known.sort((a, b) => a - b);
    if (owner === 0) log(state, `Survey complete: ${state.systems[id].name}.`, 'survey');
  }
  for (const other of state.empires) {
    if (other.id !== owner && (state.planets.some(p => p.system === id && p.owner === other.id) || state.fleets.some(f => f.system === id && f.owner === other.id))) {
      if (!e.contacts.includes(other.id)) {
        e.contacts.push(other.id); other.contacts.push(owner);
        e.contacts = [...new Set(e.contacts)]; other.contacts = [...new Set(other.contacts)];
        if (owner === 0 || other.id === 0) log(state, `First contact: ${FACTIONS[owner === 0 ? other.id : owner].name}. Diplomatic channels open.`, 'diplomacy');
      }
    }
  }
}
function visibleSystems(state, owner = 0) {
  const seen = new Set(state.empires[owner].known);
  for (const id of [...seen]) for (const n of state.systems[id].links) seen.add(n);
  return seen;
}
function route(state, start, goal, owner = 0) {
  if (!int(start, 0, N - 1) || !int(goal, 0, N - 1)) return [];
  const visible = visibleSystems(state, owner), known = new Set(state.empires[owner].known);
  if (!visible.has(goal)) return [];
  // Ternary Reach's ExactGraph path stays within the donor's 16-vertex contract.
  // Larger mod galaxies use the equivalent bounded, ascending-neighbour BFS below.
  if (N <= MAX_VERTICES) {
    const allowed = id => known.has(id) || id === start || id === goal;
    const edges = state.systems.flatMap(s => s.links.filter(n => s.id < n && allowed(s.id) && allowed(n)).map(n => [s.id, n]));
    const tree = breadthFirst(new ExactGraph(N, edges), start);
    if (tree.depth[goal] < 0) return [];
    const path = []; for (let id = goal; id !== -1; id = tree.parent[id]) path.push(id);
    return path.reverse();
  }
  const queue = [start], parent = new Map([[start, -1]]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === goal) { const path = []; for (let p = id; p !== -1; p = parent.get(p)) path.push(p); return path.reverse(); }
    if (id !== start && !known.has(id)) continue; // Never route through an unsurveyed system.
    for (const n of state.systems[id].links) if (visible.has(n) && !parent.has(n)) { parent.set(n, id); queue.push(n); }
  }
  return [];
}
function designStats(design) {
  const hull = HULLS[design.hull];
  const stats = { hp: hull.hp, attack: 0, speed: 0, cost: hull.cost, work: hull.work, slots: 0, roles: [] };
  for (const id of design.parts) {
    const c = COMPONENTS[id];
    stats.hp += c.hp; stats.attack += c.attack; stats.cost += c.cost; stats.slots += c.slots;
    stats.speed = Math.max(stats.speed, c.speed);
    if (!stats.roles.includes(c.kind)) stats.roles.push(c.kind);
  }
  return stats;
}
const role = (design, kind) => designStats(design).roles.includes(kind);
function checkDesign(design, tech, owner = null) {
  if (!design || !Object.hasOwn(HULLS, design.hull) || typeof design.name !== 'string' || !design.name.trim() || design.name.length > 32 || !Array.isArray(design.parts) || !design.parts.length || design.parts.length > 40) fail('Invalid ship design.');
  const h = HULLS[design.hull];
  if (owner !== null && h.faction !== -1 && h.faction !== owner) fail('This hull belongs to another empire.');
  if (h.level > tech[h.tech]) fail('Research this hull first.');
  for (const id of design.parts) {
    if (typeof id !== 'string' || !Object.hasOwn(COMPONENTS, id)) fail('Unknown component.');
    const c = COMPONENTS[id];
    if (c.level > tech[c.tech]) fail('Research this component first.');
  }
  const stats = designStats(design);
  if (!stats.speed) fail('Install at least one engine.');
  if (stats.slots > h.slots) fail('The design exceeds its hull capacity.');
  return true;
}
function addFleet(state, owner, system, design, name = design.name) {
  if (state.fleets.length >= E * R.fleetLimit || fleets(state, owner).length >= R.fleetLimit) return false;
  state.fleets.push({ id: state.nextId++, owner, system, name, design: structuredClone(design), hp: designStats(design).hp, path: [] });
  return true;
}
function createGame(seed = 2401, difficulty = 'standard', runHooks = true) {
  if (!int(seed, 0, 4294967295) || !['relaxed', 'standard', 'veteran'].includes(difficulty)) fail('Invalid campaign settings.');
  const state = { version: VERSION, seed, rng: seed, difficulty, turn: 1, nextId: 1, systems: [], planets: [], fleets: [], empires: [], relations: Array.from({ length: E }, (_, a) => Array.from({ length: E }, (_, b) => a === b ? 'self' : 'neutral')), log: [], battles: [], winner: null, victory: '', modState: {} };
  for (let id = 0; id < N; id++) {
    const row = Math.floor(id / R.columns), col = id % R.columns;
    const map = content.map[id];
    state.systems.push({ id, name: NAMES[id], x: 90 + col * 166 + random(state, 45), y: 90 + row * 156 + random(state, 45), links: [...map.links], relic: map.relic, claimed: false });
    for (let orbit = 0; orbit < P; orbit++) {
      const type = Object.keys(PLANET_TYPES)[random(state, Object.keys(PLANET_TYPES).length)];
      state.planets.push({ id: id * P + orbit, system: id, name: content.planetNames[id * P + orbit], type, owner: -1, pop: 0, buildings: Object.fromEntries(Object.keys(BUILDINGS).map(k => [k, 0])), queue: [] });
    }
  }
  for (let id = 0; id < E; id++) {
    const designs = content.ships.filter(s => s.empire === id).map((s, i) => ({ id: i, name: s.name, hull: s.hull, parts: [...s.parts] }));
    state.empires.push({ id, minerals: R.startMinerals, energy: R.startEnergy, science: 0, tech: Object.fromEntries(Object.keys(TECH).map(k => [k, 1])), research: 'industry', known: [], contacts: [], designs, defeated: false });
    const home = FACTIONS[id].home, planet = state.planets[home * P];
    Object.assign(planet, { owner: id, type: Object.keys(PLANET_TYPES)[0], pop: Math.min(60, Object.values(PLANET_TYPES)[0].max), buildings: Object.fromEntries(Object.keys(BUILDINGS).map(k => [k, ['mine', 'reactor', 'lab', 'yard', 'defence'].includes(k) ? 1 : 0])) });
    for (const design of designs) addFleet(state, id, home, design);
    reveal(state, id, home);
  }
  state.log = [];
  log(state, 'The frontier is yours. Survey a neighbouring star, then send your colony ark to settle a new world.', 'survey');
  if (runHooks && hooks.onCreate) hooks.onCreate(state, api);
  return state;
}
function income(state, owner = 0) {
  const e = state.empires[owner];
  const out = { minerals: 0, energy: 0, science: 0, upkeep: fleets(state, owner).reduce((sum, f) => sum + Math.max(1, Math.ceil(HULLS[f.design.hull].slots / 4)), 0) };
  for (const p of colonies(state, owner)) {
    out.minerals += PLANET_TYPES[p.type].minerals + facilityYield(p, 'minerals') + e.tech.industry * R.industryMinerals;
    out.energy += R.baseEnergy + Math.floor(p.pop / 10) + facilityYield(p, 'energy');
    out.science += R.baseScience + Math.floor(p.pop / 20) + facilityYield(p, 'science');
  }
  out.energy += state.relations[owner].filter(r => r === 'trade').length * R.tradeIncome;
  out.energy -= out.upkeep;
  return out;
}
function facilityYield(planet, field) { return Object.entries(planet.buildings).reduce((n, [k, count]) => n + count * BUILDINGS[k][field], 0); }
function production(state, planet) { return R.baseProduction + facilityYield(planet, 'production') + state.empires[planet.owner].tech.industry * R.industryProduction; }
function defence(state, planet) { return R.baseDefence + facilityYield(planet, 'defence') + state.empires[planet.owner].tech.shields * R.shieldDefence; }

// Commands validate completely before writing. The caller controls which empire may act.
function command(state, action, owner = 0) {
  if (state.winner !== null) fail('This campaign has ended. Start a new expedition.');
  const e = state.empires[owner];
  if (!e || e.defeated) fail('This empire can no longer issue orders.');
  if (action.type === 'move') {
    const f = state.fleets.find(f => f.id === action.fleet && f.owner === owner);
    if (!f) fail('Select one of your fleets.');
    const path = route(state, f.system, action.target, owner);
    if (!path.length) fail('No surveyed route. Explore the frontier one star at a time.');
    f.path = path.slice(1); return;
  }
  if (action.type === 'hold') {
    const f = state.fleets.find(f => f.id === action.fleet && f.owner === owner);
    if (!f) fail('Fleet unavailable.'); f.path = []; return;
  }
  if (action.type === 'colonize') {
    const p = state.planets[action.planet], f = state.fleets.find(f => f.id === action.fleet && f.owner === owner);
    if (!p || !f || f.system !== p.system || !role(f.design, 'colony') || p.owner !== -1) fail('An unclaimed planet and a colony ark in the same system are required.');
    if (state.fleets.some(enemy => enemy.system === p.system && atWar(state, owner, enemy.owner))) fail('Clear hostile fleets before colonising.');
    if (e.minerals < R.colonizeMinerals || e.energy < R.colonizeEnergy) fail(`Colonisation needs ${R.colonizeMinerals} minerals and ${R.colonizeEnergy} energy.`);
    e.minerals -= R.colonizeMinerals; e.energy -= R.colonizeEnergy; p.owner = owner; p.pop = 20; p.buildings.mine = 1;
    state.fleets = state.fleets.filter(x => x !== f);
    if (owner === 0) log(state, `${p.name} founded. The colony ark becomes the first settlement.`, 'colony');
    checkVictory(state); return;
  }
  if (action.type === 'build') {
    const p = state.planets[action.planet];
    if (!p || p.owner !== owner) fail('Choose one of your colonies.');
    if (p.queue.length >= 5) fail('Production queue full (five orders).');
    let item;
    if (action.kind === 'ship') {
      const d = e.designs.find(d => d.id === action.design);
      if (!d || !p.buildings.yard) fail('Ship construction requires a design and an orbital shipyard.');
      checkDesign(d, e.tech, owner);
      const stats = designStats(d);
      if (fleets(state, owner).length + colonies(state, owner).reduce((n, c) => n + c.queue.filter(q => q.kind === 'ship').length, 0) >= R.fleetLimit) fail('Fleet capacity reached.');
      item = { kind: 'ship', design: structuredClone(d), name: d.name, cost: stats.cost, work: stats.work, done: 0 };
    } else {
      if (!Object.hasOwn(BUILDINGS, action.kind)) fail('Unknown facility.');
      const b = BUILDINGS[action.kind];
      if (p.buildings[action.kind] + p.queue.filter(q => q.kind === action.kind).length >= R.facilityLimit) fail('Facility limit reached.');
      item = { kind: action.kind, name: b.name, cost: b.cost, work: b.work, done: 0 };
    }
    if (e.minerals < item.cost) fail('Insufficient minerals.');
    e.minerals -= item.cost; p.queue.push(item); return;
  }
  if (action.type === 'cancel') {
    const p = state.planets[action.planet];
    if (!p || p.owner !== owner || !int(action.index, 0, p.queue.length - 1)) fail('Production order unavailable.');
    const q = p.queue.splice(action.index, 1)[0];
    const refund = new ExactRational(q.cost).multiply(new ExactRational(q.work - q.done, q.work));
    e.minerals = Math.min(999999, e.minerals + Number(refund.numerator / refund.denominator)); return;
  }
  if (action.type === 'research') {
    if (!Object.hasOwn(TECH, action.field) || e.tech[action.field] >= R.maxTech) fail('Choose an unfinished research field.');
    e.research = action.field; return;
  }
  if (action.type === 'design') {
    checkDesign(action.design, e.tech, owner);
    if (e.designs.length >= 24) fail('Design archive full (24 classes).');
    const { name, hull, parts } = action.design;
    e.designs.push({ id: e.designs.length, name: name.trim(), hull, parts: [...parts] }); return;
  }
  if (action.type === 'diplomacy') {
    const other = action.target;
    if (!int(other, 0, E - 1) || other === owner || !e.contacts.includes(other) || state.empires[other].defeated) fail('Establish contact with an active empire first.');
    const current = state.relations[owner][other];
    if (!['war', 'peace', 'trade'].includes(action.offer)) fail('Unknown diplomatic offer.');
    if (action.offer === 'trade' && current !== 'neutral') fail('A trade pact requires neutral relations.');
    if (action.offer === 'peace' && current !== 'war') fail('You are already at peace.');
    if (action.offer === 'war' && current === 'war') fail('War is already declared.');
    const cost = action.offer === 'war' ? 0 : action.offer === 'peace' ? R.peaceCost : R.tradeCost;
    if (e.energy < cost) fail(`This agreement requires ${cost} energy.`);
    e.energy -= cost;
    state.relations[owner][other] = state.relations[other][owner] = action.offer === 'peace' ? 'neutral' : action.offer;
    log(state, `${FACTIONS[owner].name} and ${FACTIONS[other].name}: ${action.offer === 'trade' ? `trade pact signed (+${R.tradeIncome} energy per turn each)` : action.offer === 'war' ? 'war declared' : 'peace accord signed'}.`, 'diplomacy'); return;
  }
  fail('Unknown order.');
}

function ai(state, owner) {
  const e = state.empires[owner]; if (e.defeated) return;
  const tryOrder = a => { try { command(state, a, owner); return true; } catch { return false; } };
  // AI has exactly the same fog, prices, ship limits and command rules as the player.
  const research = Object.keys(TECH).filter(k => e.tech[k] < R.maxTech).sort((a, b) => e.tech[a] - e.tech[b]);
  if (research.length) e.research = research[0];
  for (const d of e.designs) {
    // Upgrade within the original component's role without breaking hull capacity.
    const next = structuredClone(d);
    next.parts = next.parts.map(id => {
      const c = COMPONENTS[id];
      const options = Object.values(COMPONENTS).filter(x => x.kind === c.kind && x.level <= e.tech[x.tech] && x.slots <= c.slots).sort((a, b) => b.level - a.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return options[0]?.id || id;
    });
    try { checkDesign(next, e.tech, owner); d.parts = next.parts; } catch { /* Retain the legal original design. */ }
  }
  for (const p of colonies(state, owner)) {
    if (p.queue.length) continue;
    const owned = fleets(state, owner), arks = owned.filter(f => role(f.design, 'colony')).length;
    if (!p.buildings.yard) tryOrder({ type: 'build', planet: p.id, kind: 'yard' });
    else if (arks < 2 && colonies(state, owner).length < COLONY_TARGET && e.minerals > 190) tryOrder({ type: 'build', planet: p.id, kind: 'ship', design: e.designs.find(d => role(d, 'colony')).id });
    else if (p.buildings.lab < Math.min(2, R.facilityLimit) && state.turn % 4 === 0) tryOrder({ type: 'build', planet: p.id, kind: 'lab' });
    else if (owned.length < Math.min(35, 3 + Math.floor(state.turn / 3))) tryOrder({ type: 'build', planet: p.id, kind: 'ship', design: e.designs.find(d => role(d, 'assault')).id });
    else if (p.buildings.mine < R.facilityLimit) tryOrder({ type: 'build', planet: p.id, kind: 'mine' });
    else if (p.buildings.defence < R.facilityLimit) tryOrder({ type: 'build', planet: p.id, kind: 'defence' });
  }
  for (const f of [...fleets(state, owner)]) {
    if (f.path.length) continue;
    if (role(f.design, 'colony')) {
      const here = state.planets.find(p => p.system === f.system && p.owner === -1);
      if (here && tryOrder({ type: 'colonize', planet: here.id, fleet: f.id })) continue;
    }
    const known = new Set(e.known), visible = [...visibleSystems(state, owner)];
    let targets = visible.filter(id => !known.has(id));
    if (role(f.design, 'colony')) {
      const settle = e.known.filter(id => state.planets.some(p => p.system === id && p.owner === -1));
      if (settle.length) targets = settle;
    } else if (role(f.design, 'assault')) {
      const hostile = e.known.filter(id => state.planets.some(p => p.system === id && p.owner >= 0 && atWar(state, owner, p.owner)));
      if (hostile.length) targets = hostile;
    }
    const options = targets.filter(id => id !== f.system).map(id => ({ id, path: route(state, f.system, id, owner) })).filter(o => o.path.length > 0).sort((a, b) => a.path.length - b.path.length || a.id - b.id);
    if (options.length) tryOrder({ type: 'move', fleet: f.id, target: options[random(state, Math.min(3, options.length))].id });
  }
  const grace = state.difficulty === 'relaxed' ? R.warGrace + 23 : state.difficulty === 'veteran' ? Math.max(5, R.warGrace - 14) : R.warGrace;
  if (state.turn > grace && state.turn % 11 === owner) {
    const target = e.contacts.find(id => !state.empires[id].defeated && state.relations[owner][id] === 'neutral');
    if (target !== undefined) tryOrder({ type: 'diplomacy', target, offer: 'war' });
  }
}

function battles(state) {
  for (const system of state.systems) {
    const present = state.fleets.filter(f => f.system === system.id);
    const combat = present.some(a => present.some(b => atWar(state, a.owner, b.owner)) || state.planets.some(p => p.system === system.id && p.owner >= 0 && atWar(state, a.owner, p.owner)));
    if (!combat) continue;
    const participants = [...new Set([...present.map(f => f.owner), ...state.planets.filter(p => p.system === system.id && p.owner >= 0).map(p => p.owner)])];
    const losses = Array(E).fill(0), damage = new Map();
    // All volleys are scheduled from the same pre-combat state; no first-owner advantage.
    for (const f of present) {
      const enemies = present.filter(g => atWar(state, f.owner, g.owner)).sort((a, b) => a.id - b.id);
      const attack = designStats(f.design).attack;
      if (attack && enemies.length) {
        const target = enemies[random(state, enemies.length)];
        const strength = state.empires[f.owner].energy === 0 ? Math.floor(attack / 2) : attack;
        damage.set(target.id, (damage.get(target.id) || 0) + strength + random(state, 5));
      }
    }
    for (const p of state.planets.filter(p => p.system === system.id && p.owner >= 0)) {
      const enemy = present.find(f => atWar(state, p.owner, f.owner));
      if (enemy) damage.set(enemy.id, (damage.get(enemy.id) || 0) + Math.floor(defence(state, p) / 3));
    }
    for (const f of present) { f.hp -= damage.get(f.id) || 0; if (f.hp <= 0) losses[f.owner]++; }
    state.fleets = state.fleets.filter(f => f.hp > 0);
    const captured = [];
    for (const p of state.planets.filter(p => p.system === system.id && p.owner >= 0)) {
      const attackers = state.fleets.filter(f => f.system === system.id && atWar(state, f.owner, p.owner));
      for (const owner of [...new Set(attackers.map(f => f.owner))]) {
        const force = attackers.filter(f => f.owner === owner);
        if (!force.some(f => role(f.design, 'assault')) || state.fleets.some(f => f.system === system.id && f.owner === p.owner)) continue;
        const power = force.reduce((n, f) => n + designStats(f.design).attack, 0);
        if (power >= defence(state, p)) {
          p.owner = owner; p.pop = Math.max(10, Math.floor(p.pop / 2)); p.queue = []; p.buildings.defence = Math.max(0, p.buildings.defence - 1);
          captured.push(`${p.name} → ${FACTIONS[owner].short}`); break;
        }
      }
    }
    if (participants.includes(0) || state.empires[0].known.includes(system.id)) {
      const report = { turn: state.turn, system: system.id, participants, losses, captured };
      state.battles.unshift(report); state.battles.length = Math.min(30, state.battles.length);
      log(state, `${system.name}: ${losses.reduce((a, b) => a + b, 0)} ship(s) lost.${captured.length ? ' ' + captured.join('; ') : ' Combat continues while hostile forces remain.'}`, 'battle');
    }
  }
}
const score = (state, owner) => colonies(state, owner).length * 100 + Object.values(state.empires[owner].tech).reduce((a, b) => a + b, 0) * 25 + fleets(state, owner).length * 5;
function checkVictory(state) {
  for (const e of state.empires) e.defeated = colonies(state, e.id).length === 0 && !fleets(state, e.id).some(f => role(f.design, 'colony'));
  if (state.winner !== null) return;
  if (hooks.victory) {
    const result = hooks.victory(state, api);
    if (result) {
      if (!int(result.winner, 0, E - 1) || typeof result.text !== 'string' || result.text.length > 200) fail('Invalid custom victory result.');
      state.winner = result.winner; state.victory = result.text; return;
    }
  }
  const contenders = state.empires.filter(e => !e.defeated);
  let winner = contenders.find(e => colonies(state, e.id).length >= COLONY_TARGET);
  if (winner) state.victory = `Expansion victory — ${COLONY_TARGET} colonies`;
  if (!winner) { winner = contenders.find(e => Object.values(e.tech).every(n => n >= R.maxTech)); if (winner) state.victory = 'Ascension victory — all sciences mastered'; }
  if (!winner && contenders.length === 1) { winner = contenders[0]; state.victory = 'Conquest victory — last empire standing'; }
  if (!winner && (state.turn >= TURN_LIMIT || state.empires[0].defeated)) {
    winner = contenders.sort((a, b) => score(state, b.id) - score(state, a.id) || a.id - b.id)[0];
    state.victory = state.empires[0].defeated ? 'Your civilisation has fallen' : 'Council victory — highest empire score';
  }
  if (winner) { state.winner = winner.id; log(state, `${FACTIONS[winner.id].name}: ${state.victory}.`, 'victory'); }
}
function endTurn(state) {
  if (state.winner !== null) fail('Campaign complete.');
  for (let owner = 1; owner < E; owner++) { ai(state, owner); if (state.winner !== null) return state; }
  state.turn++;
  for (const f of state.fleets) {
    for (let step = 0; step < designStats(f.design).speed && f.path.length; step++) {
      const next = f.path.shift(); if (!state.systems[f.system].links.includes(next)) fail('Invalid fleet route.');
      f.system = next; reveal(state, f.owner, next);
      if (state.fleets.some(other => other.system === next && atWar(state, f.owner, other.owner)) || state.planets.some(p => p.system === next && p.owner >= 0 && atWar(state, f.owner, p.owner))) break;
    }
    const sys = state.systems[f.system];
    if (sys.relic && !sys.claimed && role(f.design, 'survey')) {
      sys.claimed = true; state.empires[f.owner].science += R.relicScience; state.empires[f.owner].minerals += R.relicMinerals;
      if (f.owner === 0) log(state, `Ancient archive recovered at ${sys.name}: +${R.relicScience} research, +${R.relicMinerals} minerals.`, 'relic');
    }
  }
  battles(state);
  for (const e of state.empires) {
    for (const f of fleets(state, e.id)) reveal(state, e.id, f.system);
    const yields = income(state, e.id);
    e.minerals = Math.min(999999, add(e.minerals, Math.min(999999, yields.minerals)));
    e.energy = Math.min(999999, Math.max(0, add(e.energy, Math.min(999999, yields.energy))));
    e.science = Math.min(999999, add(e.science, Math.min(999999, yields.science)));
    if (e.tech[e.research] < R.maxTech && e.science >= techCost(e.tech[e.research])) {
      e.science -= techCost(e.tech[e.research]); e.tech[e.research]++;
      if (e.id === 0) log(state, `Research complete: ${TECH[e.research].name} ${e.tech[e.research]}. New capabilities available.`, 'research');
      if (e.tech[e.research] === R.maxTech) e.research = Object.keys(TECH).find(k => e.tech[k] < R.maxTech) || e.research;
    }
    for (const p of colonies(state, e.id)) {
      p.pop = Math.min(PLANET_TYPES[p.type].max, p.pop + Math.max(1, Math.floor(p.pop / 20)));
      const q = p.queue[0];
      if (q) {
        q.done = Math.min(q.work, q.done + production(state, p));
        if (q.done === q.work) {
          if (q.kind === 'ship') {
            if (!addFleet(state, e.id, p.system, q.design)) continue;
          } else p.buildings[q.kind]++;
          p.queue.shift(); if (e.id === 0) log(state, `${p.name}: ${q.name} ready.`, 'build');
        }
      }
    }
    // Repairs only at a friendly shipyard outside combat.
    for (const f of fleets(state, e.id)) if (colonies(state, e.id).some(p => p.system === f.system && p.buildings.yard) && !state.fleets.some(g => g.system === f.system && atWar(state, e.id, g.owner))) f.hp = Math.min(designStats(f.design).hp, f.hp + R.repair);
  }
  if (hooks.onTurn) hooks.onTurn(state, api);
  checkVictory(state);
  return state;
}

function serialize(state) { return JSON.stringify(state); }
function deserialize(text) {
  if (typeof text !== 'string' || text.length > 1500000) fail('Save file exceeds the 1.5 MB limit.');
  const s = JSON.parse(text);
  validateState(s);
  return s;
}
function validateState(s) {
  const assert = (condition, name) => { if (!condition) fail(`Invalid save: ${name}.`); };
  const record = (v, keys, name) => assert(v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k) && Object.hasOwn(Object.getOwnPropertyDescriptor(v, k), 'value')), name);
  const designRecord = d => { record(d, ['id', 'name', 'hull', 'parts'], 'design fields'); assert(int(d.id, 0, 23), 'design identifier'); };
  record(s, ['version', 'seed', 'rng', 'difficulty', 'turn', 'nextId', 'systems', 'planets', 'fleets', 'empires', 'relations', 'log', 'battles', 'winner', 'victory', 'modState'], 'campaign fields');
  let modNodes = 0;
  function modValue(v, depth = 0) {
    assert(++modNodes <= 4096 && depth <= 10, 'mod state complexity');
    if (v === null || typeof v === 'boolean' || Number.isSafeInteger(v)) return;
    if (typeof v === 'string') { assert(v.length <= 2048, 'mod string'); return; }
    assert(v && typeof v === 'object', 'mod value');
    if (Array.isArray(v)) { assert(v.length <= 256, 'mod array'); v.forEach(x => modValue(x, depth + 1)); return; }
    assert(Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).every(k => k.length <= 80 && !['__proto__', 'prototype', 'constructor'].includes(k)), 'mod record');
    Object.values(v).forEach(x => modValue(x, depth + 1));
  }
  assert(s.modState && !Array.isArray(s.modState) && typeof s.modState === 'object', 'mod state'); modValue(s.modState);
  assert(JSON.stringify(s.modState).length <= 16384, 'mod state size');
  assert(s && s.version === VERSION && int(s.seed, 0, 4294967295) && int(s.rng, 0, 4294967295), 'version / seed');
  assert(['relaxed', 'standard', 'veteran'].includes(s.difficulty) && int(s.turn, 1, TURN_LIMIT) && int(s.nextId, 1, 100000), 'campaign');
  assert(Array.isArray(s.systems) && s.systems.length === N && Array.isArray(s.planets) && s.planets.length === N * P && Array.isArray(s.empires) && s.empires.length === E, 'galaxy shape');
  const clean = createGame(s.seed, s.difficulty, false);
  const name = v => typeof v === 'string' && v.length > 0 && v.length <= 200;
  const ids = new Set();
  for (const [i, sys] of s.systems.entries()) {
    record(sys, ['id', 'name', 'x', 'y', 'links', 'relic', 'claimed'], 'system fields');
    const original = clean.systems[i];
    assert(sys && sys.id === i && sys.name === original.name && sys.x === original.x && sys.y === original.y && sys.relic === original.relic && typeof sys.claimed === 'boolean' && (!sys.claimed || sys.relic) && JSON.stringify(sys.links) === JSON.stringify(original.links), 'immutable starmap');
  }
  for (const [i, e] of s.empires.entries()) {
    record(e, ['id', 'minerals', 'energy', 'science', 'tech', 'research', 'known', 'contacts', 'designs', 'defeated'], 'empire fields');
    record(e.tech, Object.keys(TECH), 'technology fields');
    assert(e && e.id === i && ['minerals', 'energy', 'science'].every(k => int(e[k], 0, 999999)) && typeof e.defeated === 'boolean', 'empire resources');
    assert(e.tech && Object.keys(TECH).every(k => int(e.tech[k], 1, R.maxTech)) && Object.hasOwn(TECH, e.research), 'research');
    for (const [field, max] of [['known', N - 1], ['contacts', E - 1]]) assert(Array.isArray(e[field]) && e[field].length <= max + 1 && new Set(e[field]).size === e[field].length && e[field].every(id => int(id, 0, max)), field);
    assert(!e.contacts.includes(i) && e.known.includes(FACTIONS[i].home), 'empire knowledge');
    assert(Array.isArray(e.designs) && e.designs.length >= 1 && e.designs.length <= 24, 'design archive');
    e.designs.forEach((d, n) => { designRecord(d); assert(d.id === n, 'design id'); checkDesign(d, e.tech, e.id); });
  }
  assert(Array.isArray(s.relations) && s.relations.length === E && s.relations.every(row => Array.isArray(row) && row.length === E), 'relations');
  for (let a = 0; a < E; a++) for (let b = 0; b < E; b++) assert(a === b ? s.relations[a][b] === 'self' : ['neutral', 'trade', 'war'].includes(s.relations[a][b]) && s.relations[a][b] === s.relations[b][a], 'symmetric relations');
  for (const [i, p] of s.planets.entries()) {
    record(p, ['id', 'system', 'name', 'type', 'owner', 'pop', 'buildings', 'queue'], 'planet fields');
    record(p.buildings, Object.keys(BUILDINGS), 'facility fields');
    assert(p && p.id === i && p.system === Math.floor(i / P) && p.name === clean.planets[i].name && Object.hasOwn(PLANET_TYPES, p.type) && p.type === clean.planets[i].type && int(p.owner, -1, E - 1) && int(p.pop, 0, PLANET_TYPES[p.type].max), 'planet');
    assert(p.buildings && Object.keys(BUILDINGS).every(k => int(p.buildings[k], 0, R.facilityLimit)) && Array.isArray(p.queue) && p.queue.length <= 5, 'colony facilities');
    assert(p.owner >= 0 || (p.pop === 0 && p.queue.length === 0 && Object.values(p.buildings).every(n => n === 0)), 'unclaimed planet');
    for (const q of p.queue) {
      record(q, q?.kind === 'ship' ? ['kind', 'design', 'name', 'cost', 'work', 'done'] : ['kind', 'name', 'cost', 'work', 'done'], 'queue fields');
      if (q.kind === 'ship') designRecord(q.design);
      assert(q && (q.kind === 'ship' || Object.hasOwn(BUILDINGS, q.kind)) && name(q.name), 'queue item');
      const expected = q.kind === 'ship' ? (checkDesign(q.design, s.empires[p.owner].tech, p.owner), designStats(q.design)) : BUILDINGS[q.kind];
      assert(q.cost === expected.cost && q.work === expected.work && int(q.done, 0, q.work), 'production accounting');
    }
    for (const k of Object.keys(BUILDINGS)) assert(p.buildings[k] + p.queue.filter(q => q.kind === k).length <= R.facilityLimit, 'facility limit');
  }
  assert(Array.isArray(s.fleets) && s.fleets.length <= E * R.fleetLimit, 'fleet count');
  for (const f of s.fleets) {
    record(f, ['id', 'owner', 'system', 'name', 'design', 'hp', 'path'], 'fleet fields'); designRecord(f.design);
    assert(f && int(f.id, 1, s.nextId - 1) && !ids.has(f.id) && int(f.owner, 0, E - 1) && int(f.system, 0, N - 1) && name(f.name), 'fleet'); ids.add(f.id);
    checkDesign(f.design, s.empires[f.owner].tech, f.owner);
    assert(int(f.hp, 1, designStats(f.design).hp) && Array.isArray(f.path) && f.path.length < N, 'fleet condition');
    let previous = f.system;
    for (const id of f.path) { assert(int(id, 0, N - 1) && s.systems[previous].links.includes(id) && visibleSystems(s, f.owner).has(id), 'fleet route'); previous = id; }
  }
  for (const e of s.empires) assert(fleets(s, e.id).length <= R.fleetLimit && e.contacts.every(id => s.empires[id].contacts.includes(e.id)), 'empire consistency');
  assert(Array.isArray(s.log) && s.log.length <= 100 && s.log.every(l => l && int(l.turn, 1, s.turn) && typeof l.text === 'string' && l.text.length <= 1200 && ['info', 'survey', 'diplomacy', 'colony', 'battle', 'relic', 'research', 'build', 'victory'].includes(l.kind)), 'log');
  for (const l of s.log) record(l, ['turn', 'text', 'kind'], 'log fields');
  assert(Array.isArray(s.battles) && s.battles.length <= 30 && s.battles.every(b => b && int(b.turn, 1, s.turn) && int(b.system, 0, N - 1) && Array.isArray(b.participants) && b.participants.length <= E && b.participants.every(n => int(n, 0, E - 1)) && Array.isArray(b.losses) && b.losses.length === E && b.losses.every(n => int(n, 0, 60)) && Array.isArray(b.captured) && b.captured.length <= P && b.captured.every(name)), 'battle reports');
  assert((s.winner === null || int(s.winner, 0, E - 1)) && typeof s.victory === 'string' && s.victory.length <= 200, 'victory');
  for (const b of s.battles) record(b, ['turn', 'system', 'participants', 'losses', 'captured'], 'battle fields');
  return true;
}

const api = Object.freeze({ content, createGame, command, endTurn, colonies, fleets, income, production, defence, score, checkVictory, log, reveal, atWar, route, visibleSystems, designStats, checkDesign, role, techCost, serialize, deserialize, validateState });
return api;
}
