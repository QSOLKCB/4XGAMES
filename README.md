<div align="center">

# V O I D W A R D

**Explore. Expand. Exploit. Exterminate.**

A moddable, offline space 4X by **QSOL-IMC**.

[Play on GitHub Pages](https://qsolkcb.github.io/4XGAMES/) · [Modding guide](MOD_GUIDE.md) · [Source provenance](vendor/PROVENANCE.json) · [Player guide](docs/PLAYER_GUIDE.md) · [Workshop tutorial](docs/WORKSHOP.md)

</div>

Build an empire across a seeded galaxy. Survey stars, colonise worlds, direct
research, design modular ships, run orbital shipyards, sign trade agreements and
fight rival civilisations. The game takes inspiration from **Space Empires IV**;
its code, fiction, silhouettes and sound arrangements are independent originals.

## Play

Play the published version on Pages. Proposed changes become live only after
you merge and deploy their PR. To serve
this checkout locally, with no internet connection or runtime dependencies:

```sh
uv run --no-project python -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/`. Native ES modules require HTTP; double-clicking
`index.html` is not supported. Node is used for development checks only.

Select a ship in the system panel, select a neighbouring star, choose **Plot
course**, then **End turn**. Bring a colony ship to a world and choose **Colonise**.
You can also settle your second starting-system world immediately. Open **Field
manual** for the complete rules. Click **Sound off** to enable the original
procedural music and effects. Keyboard, mouse, touch and standard gamepad input
are supported; shortcuts do not execute while a dialog or form is active.

The default campaign has 30 systems, 60 planets, three empires, twelve faction
hulls, eighteen components, five facilities and four research fields. Ship
construction snapshots the design; later research never silently refits old
ships. Fleets fight on end-turn; marine ships invade after defenders are cleared.

The original campaigns offer expansion, scientific ascension, conquest, or score
at the turn limit. New campaigns use their own objective routes and deadlines;
military elimination still applies.
AI has the same economy, command validation and exploration limits. Temperament
changes the opening war grace period. Ships and colonies provide current sensors; other explored systems retain
last-seen intelligence. Combat remains automatic rather than tactical.

## Make it yours

Names, empires, planets, starlanes, ship silhouettes, components, starting fleets,
research, facilities, ambient score and rule values live in editable **`.txt` files**.
The game ships five complete campaign packs:

| Campaign | Sector | Focus |
| --- | --- | --- |
| The Open Frontier | 30 systems, 3 empires | Classic expansion and empire building |
| Machine Dawn | 16 systems, 3 empires | Shorter machine-civilisation campaign with a source-mod turn event |
| Grand Frontier: The Long Concord | 64 systems, 3 playable empires | Century-long diplomatic or territorial objectives |
| Fallen Gates: The Quiet Meridian | 36 systems, 3 playable empires | Archive discoveries and persistent branching progression |
| Siege of the Outer Rim | 40 systems, 1 playable defender | Escalating incursions, endurance or reconquest |

Use **Campaign workshop → Import .txt folder** to play a text pack without a
build or registry edit. The workshop includes a visual starmap, reciprocal lane and homeworld editing,
hull polygon tools, record forms, a text editor and portable pack import/export.
Experimental VANILLAJS Workbench projects can exchange map layouts and projected
hull silhouettes; Mod SDK exchange preserves its separate 32 KiB limit. Register trusted local JavaScript hooks for custom scenario
logic, as demonstrated by Machine Dawn. Read [MOD_GUIDE.md](MOD_GUIDE.md) for
formats, boundaries, examples, save isolation and the source map.

## Command a growing empire

Choose a scenario-defined empire, organise ships into fleets, issue standing
explore/patrol/return orders and refit ships at friendly yards. Reorder colony
queues, compare ship classes and inspect research prerequisites and unlocks.
Searchable manifests, last-seen intelligence, turn summaries and objective
ledgers keep larger expeditions readable. Music and effects have independent
volume controls. Read [campaign briefings](docs/CAMPAIGNS.md) before departure.

## Saves and offline play

Every accepted order autosaves locally. Content-hashed campaign slots keep
different packs and versions separate. Exported saves include the complete text
pack; imports validate both content and state before replacing the active run.
Original version-1 saves migrate explicitly to the new state schema.
These are editable local records, not signed achievement proofs.

The service worker caches the complete allowlisted game and all installed packs after
the first successful load. Wait for installation to finish before disconnecting.
Cache names include the service-worker scope, so other QSOL Pages projects are
unaffected. Downloaded checkouts also work through a local HTTP server offline.

## QSOL foundations

| Repository | Used in VOIDWARD |
| --- | --- |
| VANILLAJS, including merged PR #80 | Integer RNG and arithmetic; exact rational refunds; exact routing within its 16-vertex contract; audio2d synthesis; Ternary Reach command/fog design; validated Workbench, Asset Foundry, Component Forge and Mod SDK exchange |
| SONIFICATION | Browser music-lab FM synthesis and seeded Math64; no root ETQ audio path |
| OPT | Bounded texture/sample reuse; a reference parity check and scoped benchmark are included |
| OFFLINE-GAMES | Procedural planet textures; text/source mod workflow reference |
| ARCADE | Bounded audio voices and original procedural effects |
| GAMES | Neutral-rearming standard-gamepad reader |
| GLUBALL | Original knot geometry rendered as ancient archive markers |
| GALAXY | Seeded, bounded galaxy backdrop sampler |

Donor modules are local, unmodified and SHA-256 checked. Larger sectors use a
separate bounded BFS; the original ExactGraph limit remains unchanged. These
integrations make no new proof, physics or hardware performance claims.

## Development and deployment

```sh
node --test tests/*.test.mjs
node scripts/site.mjs sync
node scripts/check.mjs
node scripts/site.mjs build _site
node scripts/benchmark.mjs
# With an existing Playwright installation (tooling only):
node tests/browser.mjs
node tests/expansion-browser.mjs
```

Owner-workstation browser execution has a separate explicit handover gate; see
[the test plan](docs/OWNER_BROWSER_TEST.md). Browser, audio-device and GPU evidence
for this expansion remain pending that authorized test window.

The Pages workflow tests every PR and every push to `main`, then deploys main
after validation. There are no path filters: documentation and code changes
both trigger it. Select **Settings → Pages → Source: GitHub Actions** once.
No personal runner, package manager, cloud service, external font, image server,
account or CDN is needed to play. CI's pinned browser tools are isolated outside
the checkout. See [docs/VALIDATION.md](docs/VALIDATION.md) for executed evidence.

Apache-2.0 for original work; retain file-level donor licences and [NOTICE](NOTICE).
