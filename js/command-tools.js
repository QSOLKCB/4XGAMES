// SPDX-License-Identifier: Apache-2.0
// Read-only command summaries. Use the same information available to the player.
export function commandReadiness(state, engine) {
  const owner = state.player ?? 0;
  const ships = engine.fleets(state);
  const idleFleets = ships.filter(f => !f.refit && !f.path.length && (!f.order || f.order.type === 'hold'))
    .sort((a, b) => a.id - b.id);
  const idleColonies = engine.colonies(state).filter(p => !p.queue.length).sort((a, b) => a.id - b.id);
  const threats = [];
  for (const system of engine.visibleSystems(state)) {
    const intel = engine.systemIntel(state, system);
    if (!intel?.current) continue;
    const hostile = intel.fleets.filter(f => state.relations[owner][f.owner] === 'war' && f.attack > 0);
    if (hostile.length) threats.push({ system, ships: hostile.reduce((n, f) => n + f.ships, 0) });
  }
  return { idleFleets, idleColonies, threats };
}

export function chartedSystems(state, engine, query = '') {
  const term = query.trim().toLocaleLowerCase();
  const known = new Set(state.empires[state.player ?? 0].known);
  return [...engine.visibleSystems(state)].map(id => ({ id, name: state.systems[id].name, surveyed: known.has(id) }))
    .filter(s => !term || s.name.toLocaleLowerCase().includes(term) || String(s.id) === term)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}
