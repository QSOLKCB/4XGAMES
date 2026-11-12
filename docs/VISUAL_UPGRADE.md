# Visual upgrade: liveries, themes and the living chart

This upgrade builds on merged 4XGAMES PR #5 at
`382f458998cf3c28e82047f64709722761559034`. It changes presentation, controls and
preferences only. `js/core.js`, `js/content.js`, `js/save-codec.js`, every
campaign directory and every previously vendored donor file are byte-identical.
Saves, fingerprints, migrations and the owner-workstation browser gate are unchanged.

## Determinism contract

Authoritative gameplay stays a pure function of the seed and the command
sequence. Everything added here reads state, pack and local preferences and
paints pixels or schedules sound:

- Painters never call `Math.random`, read the clock, or write to the state.
  Cosmetic noise (weathering scratches, settlement lights) uses VANILLAJS
  `seededRandom` keyed by hull or planet identity, so the same input always
  paints the same call sequence. Node tests compare repeated paints exactly.
- Chart overlays derive from the player's own fleets plus current or last-seen
  intelligence. Hidden changes to rival colonies, technology, designs, fleets or
  population leave every chart mode, the minimap and the hover brief unchanged.
- Liveries, themes, minimap, detail level and the music arrangement live in
  `voidward.preferences.v1` and `voidward.liveries.v1`. They are not saved with
  campaigns, exported with packs or hashed into save-slot identity.
- Undo reinstates an earlier accepted state object. `act()` always applies an
  order to a structured clone, so the previous state was never mutated; it is
  re-validated before it becomes active. Ending a turn clears the history: turn
  resolution is final and replays stay reproducible.
- E8 music variations read the campaign seed to order the 240 E8 roots. The
  variation is bounded (32 notes within 24..96 MIDI, 1..8 seconds) and quantised
  to the pack score's own pitch classes. It never writes to the state.

## Fleet liveries

Eight built-in hangar liveries (Fleet standard, Ceramic white, Obsidian stealth,
Gilded relic, Foundry hazard, Verdant lattice, Crimson vanguard, Nebula
iridescent) define hull metals, a panel pattern, a faction trim style, an engine
flame tint, glow and weathering. The faction colour and accent always remain on
the trim, bridge and engine bloom, so empires stay identifiable.

- Every faction receives a stable **automatic** livery from a hash of its own
  text (short name and ethos). It is the same in every browser and after reloads.
- **Settings → Fleet liveries** overrides any faction of the active campaign.
  **Ship designer → Fleet livery** and **Campaign workshop → Hangar liveries**
  change your own fleet. Selections are keyed by campaign ID and empire slot.
- **Role decals** read a design's installed parts: sensor dish for survey arrays,
  habitat pods for colony modules, marine bays, gun pods for weapons and a shield
  halo. Rival ships drawn from intelligence use the last-seen design snapshot the
  engine already exposes; decals add no information.
- **Livery packs** are inert JSON validated by DRONE-RACER's plain-data readers
  (`vendor/drone-racer/src/data.js`): exact field sets, dense arrays, six-digit
  colours, named pattern choices and bounded numbers. Packs are limited to 16 KiB
  and 16 liveries. Download the editable template from Settings, change it,
  import it. An imported ID may replace a built-in of the same ID. The format is
  documented in [MOD_GUIDE.md](../MOD_GUIDE.md#fleet-livery-packs).

## Chart, worlds and interface

- **Spectral tints.** Unclaimed stars take a decorative O/B/A/F/G/K/M tint from a
  hash of the seed and system ID. Owned stars keep their empire colour; your own
  colonies gain a ring and your home star a halo. No rule reads the class.
- **Overlays.** Owned territory shows a soft ring and glowing lanes, friendly
  orbits draw an arc, last-reported hostile forces draw a dashed red ring. The
  new **Intel age** chart mode rings each charted system: solid mint for live
  sensors, fading amber with the age of the last report.
- **Hover brief.** Hovering or focusing a star shows its class, lanes, charted
  worlds and owners, reported hostiles, archive status, report age and your ships.
- **Minimap.** A pan-free overview with your viewport rectangle. Select a point
  to centre the chart there. Hidden on narrow screens and through Settings.
- **Pointer zoom.** The mouse wheel, `+`/`−`, gamepad shoulder buttons and the
  zoom controls zoom around the pointer or chart centre. `0` fits the galaxy.
- **Worlds.** Eight planet variants add rings, moons and atmosphere rims. Settled
  worlds show night-side city lights in the owner's colour. Your colonies scale
  lights by population; foreign worlds use a fixed density because their current
  population is not your information.
- **Themes.** Frontier (default), Obsidian, Ember and Nebula recolour surfaces,
  controls, charts and dialogs through CSS variables. High contrast, reduced motion
  and label preferences combine with any theme.
- **Motion.** A slow fixed star drift, star twinkle, selection pulse, toast and
  dialog transitions are CSS only and disabled by reduced motion.
- **Manifests.** Fleet rows show role pills; colony rows show population bars;
  the designer lists fitted roles and previews the chosen livery.
- **Undo.** `Ctrl/Cmd Z` or the command-deck **Undo** button withdraws the last
  accepted order this turn, up to 24 steps. **C** opens the next idle colony.
- **Music.** Settings offer the campaign score or seeded E8 lattice variations
  (E8_MUSIC core, MPL-2.0, `vendor/e8-music/`).

## Compatibility and limits

- Old saves, packs and the version-1 migration are unchanged. Packs do not
  declare liveries, spectral classes or themes; none of these enter exports.
- `paintShip(canvas, hull, empire, large, options)` and
  `paintPlanet(canvas, palette, variant, options)` keep their earlier call shapes;
  omitted options paint the Fleet standard livery and an unsettled world.
- `drawMap` keeps direct rendering (OPT-INV-001 remains closed; no raster cache).
  The `lean` chart detail skips dust and grid work for slower devices.
- The minimap and hover brief are hidden below 760 px; touch users keep the pan
  toggle, zoom controls and the system picker.
- Pixel parity, human colour judgement, audio listening and physical devices are
  not verified by Node tests. See the verification record below.

## Verification

Executed on the implementation tree before this PR (Node 22.18.0, Linux):

```sh
node --test tests/*.test.mjs   # 115 tests pass (10 new)
node scripts/site.mjs sync
node scripts/check.mjs         # 66 pinned donor files; 8 valid campaigns; complete offline inventory
node scripts/site.mjs build _site
```

New Node coverage (`tests/visual.test.mjs`, `tests/presentation.test.mjs`):
livery pack admission and rejection, stable automatic assignment, exact repeat
paints for every livery/role/variant, hull fit for every livery, hidden-information
parity for all four chart modes, both detail levels and the minimap, chart
transform inversion for recentring, E8 variation bounds and seeding, undo/redo
semantics including turn finality and rejected commands, and last-seen-only briefs.

Browser execution: the hosted pull-request workflow runs `tests/browser.mjs`,
`tests/expansion-browser.mjs`, `tests/workbench-browser.mjs` and
`tests/command-browser.mjs` against the staged package. No browser test was run
on the owner workstation for this change; that window requires the explicit
`proceed` handover in [AGENTS.md](../AGENTS.md). Screenshots of the themes and
liveries should be captured in that window or from the CI artifact.
