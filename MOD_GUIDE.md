# Your universe, in plain text

VOIDWARD's entire source is included. Content lives in UTF-8 `.txt` campaign
files; deeper rule changes are ordinary local JavaScript. There is no workshop
account, paid SDK, binary database or runtime build service.

## Start with a working campaign

1. Copy `mods/frontier/` into `mods/my-campaign/`.
2. Change `id`, `version`, `title` and `description` in `campaign.txt`.
3. Edit the text files. Open **Campaign workshop → Import .txt folder** and select
   your copied directory. It validates and starts as a data-only campaign.
4. Alternatively, use **Edit text files** inside the game. **Download this .txt**
   saves an individual edited file. **Validate & start** starts the edited pack;
   **Export campaign pack** exports all files in a portable JSON envelope.
   Reopen that envelope with **Edit text files → Open portable pack**.
5. To ship a pack with the game, add its ID, title, local directory URL and hooks
   to `mods/registry.js`. Run the offline inventory command below.

All tables use **one record per line**, with `|` between fields. Blank lines and
lines beginning `#` are ignored. The first comment in each file lists its column
order. Do not put `|` inside a name or description. Name files contain one name
per line. Settings use `key = value`. IDs are lowercase letters, digits and
hyphens, beginning with a letter, at most 40 characters. Duplicate IDs are errors.
Use ordinary names from your own fiction, or assets you have permission to share.

## File reference

| File | Meaning |
| --- | --- |
| `campaign.txt` | Pack ID, semantic version, title and description |
| `empire_names.txt` | Full empire names, one per line, in empire-ID order |
| `empires.txt` | `id | short | #primary | #accent | home-system-id | ethos` |
| `system_names.txt` | Names of stars, in system-ID order |
| `planet_names.txt` | Names of worlds, in `system × planetsPerSystem + orbit` order |
| `planet_types.txt` | `id | name | population-cap | base-minerals | palette` |
| `map.txt` | `system-id | comma-separated-neighbours | archive-0-or-1` |
| `hulls.txt` | `id | name | faction-id-or-* | slots | hp | cost | work | research-id | required-level | polygon` |
| `components.txt` | `id | name | role | slots | cost | hp | attack | speed | research-id | required-level | description` |
| `ships.txt` | `empire-id | class-name | hull-id | comma-separated-component-ids` |
| `buildings.txt` | `id | name | cost | work | minerals | energy | science | production | defence | description` |
| `research.txt` | `id | name | description` |
| `music.txt` | `MIDI-note-number | duration-in-seconds` |
| `rules.txt` | Numeric economy, population, construction, diplomacy and victory settings |

Text packs are bounded to 500 KB total, 100 KB per file. Labels are displayed as
text, never interpreted as HTML. Uploaded files cannot execute code or fetch
remote URLs. Missing files, invalid rows, duplicate IDs, invalid geometry,
disconnected maps and illegal starting ships are rejected before activation.

## Empires and worlds

Use 2–6 empires with consecutive IDs starting at zero; **empire 0 is playable**.
Each empire needs a distinct starting system and at least one ship carrying each
of `survey`, `colony` and `assault` roles (one ship can carry multiple roles).
Starting designs must fit their hull and require only level-I technology.

`columns × rows` determines 4–64 systems. Each system has 1–4 planets. Provide
enough names for all systems and planets. The seeded map jitter and planet types
are generated reproducibly; homeworlds use the first entry in `planet_types.txt`.
Population caps must be 20–1,000. The three built-in procedural planet palettes
are `ocean`, `gas` and `ice`; change `js/render.js` for other texture generators.

Every `map.txt` link must be reciprocal, with no self-links or duplicates, and
the graph must be connected. Example: if system 0 lists 1, system 1 must list 0.
Stars with archive=1 carry a GLUBALL visual marker and a one-time survey reward.
Coordinates are illustrative chart units; starlanes are not physical distances.

## Ship frames and the ship designer

Each empire ships with four original silhouettes: scout, colony ark, frigate and
capital hull. Change any hull's stats, polygon or faction. `*` makes a hull
available to every empire. Hull slot capacity may be 2–40; polygon vertices are
`x,y;x,y;...`, 3–40 points, each coordinate between -60 and 60. The nose is toward
negative Y. These are 2D chart/blueprint silhouettes, not 3D imported meshes.

Example new shared hull:

```text
courier | Frontier Courier | * | 7 | 45 | 55 | 60 | industry | 1 | 0,-48;24,20;12,38;-12,38;-24,20
```

Component roles are `engine`, `weapon`, `shield`, `survey`, `colony`, `assault`.
Each component declares its own size, price, hull contribution, attack and
technology requirement. Hull/attack contributions sum; movement uses the
fastest installed engine. **Every ship needs at least one engine.** Only engines
may supply speed (1–4 lanes per turn). Duplicate components are allowed, so a
player can build multi-weapon or heavily shielded designs within available slots.

```text
plasma | Plasma lance | weapon | 2 | 60 | 0 | 35 | 0 | weapons | 3 | Heavy energy weapon.
```

Add that row and it appears in the in-game designer, locked until Weapons III.
Add a hull and it appears for its faction when unlocked. The game never relies
on a hard-coded list of hull IDs, silhouettes or part prices. It validates capacity,
research, role and faction ownership when registering or building a design.
Queued and built ships keep snapshots; editing another class never refits them.

`ships.txt` defines both the starting ships and each empire's initial design
archive. Class names may contain 1–32 characters. Built-in AI retains its role
and upgrades components to researched alternatives that fit the same slot size.
For different AI design policies, edit `ai()` in `js/core.js`.

New role semantics, arbitrary 3D meshes, textures and alternate battle engines
require source extensions. The text format does not pretend to import every
asset format or automatically implement a newly invented gameplay rule.

## Economy and technology

All balances, yields, hull points and command outcomes are bounded integers.
Cancellation refunds use VANILLAJS ExactRational multiplication and explicit
floor conversion, following the exact authoring approach of Ternary Reach.

`mine`, `reactor`, `lab`, `yard`, `defence` are required building IDs; add additional
IDs freely. All declared resource and production yields accumulate per facility.
The `yard` ID enables shipbuilding/repair, and `mine` is given to new colonies.
`industry`, `propulsion`, `weapons`, `shields` are required research IDs. You can
rename them and add additional fields for component unlocks. Added fields also
participate in the all-sciences victory condition.

`rules.txt` must contain exactly the keys shown in the supplied example. Main knobs:

| Setting | Effect |
| --- | --- |
| `startMinerals`, `startEnergy` | Same initial stockpiles for all empires |
| `colonizeMinerals`, `colonizeEnergy` | Settlement cost, in addition to consuming the ark |
| `baseProduction`, `industryProduction`, `industryMinerals` | Colony production and industry-level bonuses |
| `baseEnergy`, `baseScience` | Base colony income before population and facility yields |
| `baseDefence`, `shieldDefence` | Base and shield-tech planetary strength |
| `researchBase`, `researchStep` | Next level costs `base + currentLevel² × step` |
| `maxTech` | Common technology ceiling, 2–8 |
| `tradeIncome`, `tradeCost`, `peaceCost` | Treaty yields and immediate prices |
| `warGrace` | Standard AI war grace; relaxed adds 23 turns, aggressive subtracts 14 (minimum 5) |
| `relicScience`, `relicMinerals` | One-time archive salvage |
| `repair` | Hull points repaired per turn at a friendly shipyard outside fleet combat |
| `facilityLimit` | Maximum facilities of each type per colony, 1–10 |
| `fleetLimit` | Maximum ships plus reserved ship orders per empire, 3–60 |
| `colonyTarget`, `turnLimit` | Expansion threshold and final council scoring turn |

Full checked bounds live in `js/content.js`. Colonies have five queue slots and
each empire has 24 registered-class slots. A queue pays its full mineral cost on
admission, advances only its head each turn, and refunds the unfinished fraction
when cancelled. Zero energy halves ship attack; upkeep cannot make energy negative.

## Source mods and custom campaigns

Add a local module to your pack and statically import it in `mods/registry.js`:

```js
import myHooks from './my-campaign/hooks.js';
// Add to campaigns:
{ id: 'my-campaign', title: 'My campaign',
  base: new URL('./my-campaign/', import.meta.url), hooks: myHooks }
```

Hooks receive `(state, api)` and run only for the selected registered campaign:

```js
export default {
  onCreate(state, api) {
    api.log(state, 'The observatory is calling.', 'info');
  },
  onTurn(state, api) {
    if (state.turn === 12) {
      state.empires[0].minerals += 100;
      api.log(state, 'A supply convoy arrives.', 'build');
    }
  },
  victory(state, api) {
    if (api.colonies(state).length >= 4 && state.empires[0].science >= 400)
      return { winner: 0, text: 'The observatory network is complete.' };
    return null; // Continue checking normal campaign victories.
  }
};
```

`onCreate` runs once for a new campaign, never on save validation. `onTurn` runs
after movement/combat/economy/construction, before normal victory evaluation.
`victory` can supply a bounded winner/text result. The browser applies each order
to a candidate state and validates it before replacing the active campaign, so a
throwing or invalid hook cannot partially commit a turn.

Source hooks are **trusted local JavaScript**, with normal page privileges. They
are not sandboxed. Read source before installing it. Persist custom progress in
`state.modState`: a JSON object bounded to 16 KiB, depth 10, 4,096 nodes, 256
items per array and 2,048 characters per string. Numbers must be safe integers.
The base state schema rejects unknown fields. Imported `.txt` folders and
portable text packs never activate hooks, even if their ID matches a registered
campaign. A registered source-mod save must match that installed campaign's exact
text content. Ship API state as bounded JSON, use the campaign turn, and avoid
ambient randomness/time if deterministic replay matters. Machine Dawn contains a
working turn-8 event. Hook versioning belongs in the campaign version.

## Saves, packaging and testing

Each save key includes the campaign ID, version, complete content SHA-256 and
whether it uses installed source hooks or imported text. Edits create another
slot. Starting a fresh game in an existing slot overwrites that slot after the
new-game dialog; export first to preserve it. Exported saves include the text
pack and state. Invalid imports leave the live campaign untouched.

Run after any content or runtime edit:

```sh
node --test tests/*.test.mjs
node scripts/site.mjs sync
node scripts/check.mjs
node scripts/site.mjs build _site
node tests/browser.mjs
```

Browser QA uses an external Playwright installation; the runtime has no package
dependencies. The stage allowlists only the game, guides, packs and vendor source.
The service worker caches this inventory, including new registered packs. Always
refresh its generated digest when changing files. Validate new and restored
campaigns, starting ships, routes, victory, defeat, malformed pack imports, narrow
screens and offline reload before distribution.

## Source map

| File | Extend here |
| --- | --- |
| `js/content.js` | Text schemas, bounds, pack references and new catalog fields |
| `js/core.js` | Turn order, AI, resource rules, routing, combat, save admission |
| `js/app.js` | Screens, controls, workshop, saves, command dispatch |
| `js/render.js` | Ship/planet artwork, map layers, texture cache |
| `js/audio.js` | Original ambience arrangement and event sounds |
| `mods/registry.js` | Installed packs and trusted source hooks |
| `scripts/site.mjs` | Deployment inventory and scope-isolated offline cache |

Retain original Apache-2.0 and file-level donor licences, plus attribution for
your own contributions. No canonical geometry, physical validity, proof coverage
or cross-runtime audio identity is inherited merely by making a game with these
modules. Create new worlds and share the source.
