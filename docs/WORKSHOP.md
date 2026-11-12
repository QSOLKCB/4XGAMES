# Build a universe

Start with a working pack. **Campaign workshop → Visual workshop** edits a detached
copy of the active campaign; your running expedition stays intact until you
validate and start the draft. Export a native campaign pack before sharing or
making another major revision. Text and visual editing use the same schemas.

## A first playable campaign

1. Open The Open Frontier, then the visual workshop. Choose **Create new galaxy**
   and enter a new lowercase ID, title, dimensions, geography and home positions.
   Generation uses the active expedition's seed. Set that seed in **New game**
   first if you want a particular one. Under **Scenario & rules**, edit the new
   campaign's description and semantic version, then choose **Apply scenario**.
2. In **Galaxy**, select stars to edit their coordinates and add/remove reciprocal
   starlanes. A map must remain connected. Disconnecting it is rejected without
   altering the draft.
3. Edit empire names, colours, ethos and homes. Add `scenario.txt` settings to list
   which empires the new-game dialog may offer. Every empire still needs a legal
   survey ship, colony ship and marine-capable ship at level-I technology.
4. Choose a hull. Click polygon points on its canvas or enter them using the
   keyboard. Keep 3–40 points, each coordinate within −60..60. Preview the nose
   toward negative Y. The point editor changes a 2D silhouette, not a 3D mesh.
5. Use record forms to edit hull slots/stats, components, starting classes,
   research, buildings, objectives and events. Table headers match the text
   reference in [MOD_GUIDE.md](../MOD_GUIDE.md). Labels are plain text.
6. Apply each form or text change, then choose **Validate & preview**. Diagnostics
   name the file, physical line and field; comments and blank lines count.
   Resolve the first reported error and validate again.
7. Choose **Export draft pack**, then **Open portable pack** to reimport that file.
   Choose **Launch draft campaign**, select an empire, then **Launch edited
   universe**. Launch inherits the active expedition's seed and difficulty.
   Play a turn and inspect the map, ship designer and production list. To change
   difficulty, use **New game → Current imported campaign** after launch.

**Edit text files** remains useful for bulk changes. `.txt` folder import ignores
unrecognised files, including JavaScript; portable packs carry only supported
inert files. Source hooks require an explicit static registry import and are never
enabled by matching an uploaded pack's ID.

## Copyable authoring example

The same transaction helpers used by the UI are available to local tools. Run
from the repository with Node; no package install is needed. Save this as
`my-campaign.mjs` in the repository root and run `node my-campaign.mjs`:

```js
import fs from 'node:fs/promises';
import { PACK_FILES, parsePack } from './js/content.js';
import { createCampaign, updateHull, exportPack, importPack } from './js/workshop.js';
import { createEngine } from './js/core.js';
const base = Object.fromEntries(await Promise.all(PACK_FILES.map(async name =>
  [name + '.txt', await fs.readFile('mods/frontier/' + name + '.txt', 'utf8')])));
let draft = createCampaign(base, {
  id: 'my-reach', title: 'My Reach', description: 'A connected thirty-star ring.',
  columns: 6, rows: 5, homes: [0, 10, 20], geography: 'ring', seed: 421
});
draft = updateHull(draft, 'scout-0', {
  name: 'Courier', shape: [[0, -40], [30, 30], [-30, 30]]
});
const text = exportPack(draft);
await fs.writeFile('my-reach.json', text);
const pack = parsePack(importPack(text));
const engine = createEngine(pack), game = engine.createGame(421);
engine.validateState(game);
engine.endTurn(game);
```

The generator in `scripts/generate-campaigns.mjs` builds all three new shipped
campaigns through these operations and an export/import check. The authoring
regression suite also creates a new family, changes its starting fleet, crosses
the real Workbench/SDK formats and starts a valid game from the imported result.
Browser confirmation of the visible workflow is recorded separately.

## VANILLAJS Workbench, Component Forge and Asset Foundry

The bridge uses the real `parseProject`/`serializeProject`, scene and Component
Forge validators from VANILLAJS commit
`b12f24f789da81325491f96b5c2dd786d31e96f0` (PR #81). The experimental Workbench is
now bundled at [editor/index.html](../editor/index.html), including a separate
campaign draft and recovery. Choose **Open in 3D Workbench** from the visual
workshop to send the current draft. Follow the [3D Workbench guide](WORKBENCH.md)
for viewport editing and returning a draft to the game. Exchange **project JSON**
or a hull bundle, not exported scene-preview HTML. Imported data never runs code.

For a ship family:

1. Export a hull project from the workshop, or create an original OBJ mesh in
   Asset Foundry and place it in a Workbench scene.
2. Retain the asset's declared licence and source identity. Export the project.
3. Import the project in VOIDWARD, select its entity, and inspect the silhouette
   preview before applying it to a hull.
4. Export the campaign. `provenance.txt` retains the source name, SHA-256, declared
   licence and conversion operation. Check the class and build it in a test game.

Use **Export hull + attribution** for complete source history. A hull bundle
retains multiple sources, even when they have the same bytes but different
source/licence declarations. Native **Export hull to Workbench** rejects cases
that would lose multiple declarations or a long source name. Mixed imported
meshes and built-in geometry retain their separate declarations; a built-in
primitive never inherits another mesh's sharing licence.

The adapter projects world X/Z into chart X/Y, including composed scale/yaw and
child meshes, then centres and scales the **convex** boundary. This loses height,
concave notches, textures, materials and physics behaviour. Component Forge's
collider, controller, trigger and camera components are validated but do not
become weapons, orders or objectives. Geometry with no usable boundary or more
than forty boundary points is rejected. Licences are declarations carried by the
source; the bridge cannot verify ownership. `OWNER-LOCAL-ONLY` remains so.

For maps, export a map project and move the entities named `star-0`, `star-1`, etc.
Keep exactly one of every star. Importing updates positions only; lanes and empire
homes stay explicit VOIDWARD data. **One Workbench unit equals two chart units**
on both axes. This fixed scale covers the entire ±2000 chart range within the
donor's ±1000 position limit. The full 64-star shipped map roundtrip is tested.

Donor limits remain unchanged: 256 KiB project, 128 scene objects, 32 assets;
OBJ input 64 KiB and 512 output triangles. These are separate from VOIDWARD's
500 KB native text-pack budget. The bridge does not claim arbitrary 3D asset or
Workbench feature compatibility.

## Mod SDK exchange, packaging and updates

Native export is the general sharing format, `voidward.text-pack.v1`. A pack is
self-contained `.txt` content, with no URLs or executable modules. Share that
JSON file or its original text directory. Recipients import, validate and start
it through the workshop; no installation service or account is required.

**Mod SDK export** wraps one typed VOIDWARD entry in the actual VANILLAJS data
manifest and validates it with `DataModRegistry`. SDK limits are 32 KiB total,
8192 characters per string, bounded depth/nodes and exact dependency versions.
The bridge requires a single self-contained entry with no external dependency.
Larger packs should use native export; SDK export rejects them explicitly instead
of relaxing the donor's bounds. Both formats are accepted by workshop import.

Increment a pack's version when changing shared content. Export saves before
updating. Different content hashes use different slots; an old save continues
with its embedded text, while source-hook saves require the installed exact
version. Imported data cannot install hooks. New mechanics require source edits,
not data expressions; see the source boundary in the modding guide.

## Troubleshooting

- **Missing file:** keep all fourteen original `.txt` files. Optional empty tables
  may be omitted; registered installed packs must list their actual extra files.
- **Disconnected galaxy:** restore a reciprocal lane or generate another map.
- **Unreachable objective:** check amount bounds, archive existence, owner scope,
  branch compatibility and prerequisites. Structural validation cannot prove a
  military strategy will win; run a campaign sweep and play it.
- **Locked component:** research its field and level, including dependencies.
  Starting classes must be legal at level I.
- **No Workbench silhouette:** choose visible geometry with a nonzero X/Z area;
  simplify it to at most forty convex boundary points.
- **SDK export too large:** use native export. The native and SDK budgets differ.
- **Save rejected after a source-mod update:** restore that installed version or
  start a new expedition with the new data; keep the original exported save.
