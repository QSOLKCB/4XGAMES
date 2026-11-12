# VOIDWARD architecture

The authoritative simulation is a deterministic, bounded JavaScript state machine.
It does not depend on the DOM, Canvas, Web Audio, wall time or network requests.

| Layer | Files | Contract |
| --- | --- | --- |
| Content admission | `js/content.js` | Required legacy text tables plus optional schemas; explicit bounds and references; physical diagnostics; inert data only |
| Simulation | `js/core.js` | Seeded state creation, legal orders, AI, turn resolution, objectives/events, migration and strict save admission |
| Authoring | `js/workshop.js` | Detached text transactions; validate before replacing a draft; native/SDK envelopes |
| Workbench adapter | `js/workbench-bridge.js` | Real donor project validation; documented map scale and lossy convex hull projection; retained licence/source metadata |
| Interface | `js/app.js`, `style.css` | Candidate-state commands, save isolation, accessible controls, scalable manifests and visual authoring |
| Presentation | `js/render.js`, `js/liveries.js`, `js/audio.js` | Read-only rendering/audio; seeded cosmetic noise; inert livery packs; bounded cosmetic caches and independent audio buses |
| Installed content | `mods/registry.js`, `mods/*` | Text packs plus explicitly trusted source hooks |
| Packaging | `scripts/site.mjs`, `sw.js` | Public-file inventory, generated content digest, Pages subpath support and scope-isolated offline cache |

`createGame(seed, difficulty, true, player)` creates a scenario-defined empire
selection. `command(state, order, owner)` admits an order; `endTurn(state)` runs
other empires, movement, combat, economy, production/refits, events and victory.
The UI clones the active state, applies an order, validates the candidate and
commits it only on success. Invalid content and failed source hooks cannot partly
replace the running campaign. Node tests call this same simulation API.

Version-1 save migration is explicit and pure with respect to its input. Unknown
fields are rejected before adding version-2 groups, orders, intelligence and
progress. Registered hooks are never called during validation. Hooks are trusted
source extensions with page privileges, not a sandbox for uploaded JavaScript.

AI issues legal commands and plans through each empire's known graph and sensor
or last-seen records. It can pack researched templates, construct larger combat
hulls, refit stationary ships and concentrate assault groups. Campaign objectives
are bounded predicates and events are bounded actions, never evaluated text.
The engine owns event receipts and historical objective completion.

Rendering receives state but does not write to it. `__voidward` exposes cloned
snapshots for diagnostics; editing a snapshot cannot issue an order. Planet
textures, star samples and audio notes have explicit entry/byte bounds.
The backdrop uses direct rendering: a proposed raster cache failed exact pixel
parity on hardware-accelerated Chromium and was removed under the OPT contract.
The uncached backdrop remains available for complete RGBA comparison. A passing
Node template/audio test does not establish browser layout, sound output or GPU
use; the separately gated owner test records those observations.

The runtime is native ES modules, local procedural assets and one service worker.
Node and Playwright are development tooling only. No generated bundle, remote
font, CDN asset, account, server simulation or plugin runtime is required to play.
