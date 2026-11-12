# Horizons: campaigns and the command deck

This upgrade builds on merged 4XGAMES PR #4 at
`11c0fa582e1b28953f0df8f2a7a5f7217cb08953`. The integrated Workbench remains pinned
to VANILLAJS PR #81 / `b12f24f789da81325491f96b5c2dd786d31e96f0`, including the
Ternary Reach foundation at `5a91cd4cc7251c485eaf2fc80d5227a20571fd8c`.
Existing vendor files, notices and provenance hashes are unchanged.

## New expeditions

| Campaign | Stars / worlds | Playable factions | Routes |
| --- | --- | --- | --- |
| Helix Accord: The Threefold Charter | 24 / 48 | Lattice Compact, Tidebound Exchange, Cinder Directorate | Exchange (turn 36), Federation (turn 44) |
| Emberwake Exodus: The Last Convoy | 32 / 64 | Ashwake Flotilla, Gloam Gardeners, Sunspindle Union | Convoy (turn 48), Havens (turn 55) |
| Glass Meridian: The Unwritten Sky | 48 / 96 | Prism Cartographers, Mnemonic Choir, Null Survey | Unwritten (turn 58), Preserve (turn 65) |

There are now eight installed campaigns and eighteen campaign/empire choices.
The nine new factions have 36 original hull polygons, distinct starting resources,
fleet equipment and colony distributions. Each new pack includes authored
geography, an eight-note score, thematic facilities, component alternatives,
conditional grants and recurring supply events. All content uses the existing
inert text schemas and can be edited, exported and imported.

These three are shorter builder/explorer expeditions. Their objectives belong to
the chosen player; rivals continue ordinary expansion, diplomacy and warfare.
Objective thresholds do not guarantee the duration or outcome of a human game.
The five previous campaign directories remain byte-identical. Their long campaigns,
competitive races, siege rules and saved source-hook identities are preserved.
Read [campaign briefings](CAMPAIGNS.md) for faction differences and route rules.

## Command and presentation improvements

- A command deck exposes idle ships, idle colony production and current hostile
  sensor contacts. The readiness list excludes stale and hidden forces.
- A searchable command menu (`Ctrl/Cmd K` or `/`) finds charted systems by name
  or number and gives access to saves, new expeditions and readiness.
- `N` cycles idle ships, `H` returns home, and arrow keys navigate focused stars.
  These controls select and inspect; orders still need explicit confirmation.
- Mouse dragging pans empty chart space. A Pan toggle enables touch dragging;
  disabling it leaves normal mobile page scrolling available. Fit galaxy resets
  both zoom and pan. Jumping to offscreen systems brings them into view.
- Settings add full/decluttered labels, high contrast and an optional readiness
  review before advancing a turn. Existing sound, motion and save keys remain.
- Expedition briefings show the chosen faction, home, starting fleet/resources,
  map geography and victory timing before launch.
- Calm nebula dust, chart coordinates, ownership-aware lanes, selection brackets,
  directional route arrows and faction hull panel/engine patterns improve visual
  orientation. Proposed routes are dashed mint; committed routes are solid amber.

## Browser corrections

Star controls retain their DOM identity during map resize, zoom and pan, preserving
keyboard focus. Canvas backing dimensions change only when the actual pixel size
changes. Fractional device scale uses the integer backing size for projection,
keeping the raster aligned with the controls. Small viewports no longer invert
the map, and admitted maximum-sized hulls fit their rotated previews.

The player interface can still select systems, issue commands and show textual
information if Canvas2D is unavailable; cosmetic imagery is omitted. The 3D
Workbench retains its separate existing renderer support and limits.

Same-view redraws preserve each horizontal table and hull-atlas scroll position.
Opening idle colonies clears an older search that would hide the listed queues.
A delayed campaign load cannot replace a newer dialog, and a failed campaign
selection keeps Launch disabled until a valid pack is available.

## Exact engine reuse

AI component rankings are now reused only within one synchronous AI design phase.
No ranking survives an empire, state, technology, catalogue or turn change.
Intelligence snapshots aggregate fleets once, preserving the original accumulation
and empire output order. Both changes preserve exact state and save semantics.

The fixed differential workload compared baseline and proposed engine states
after every step: **60 workloads / 4,393 steps, every serialized byte identical**.
Both versions validate throughout; final saves pass independent admission.
Five original-campaign witnesses are retained in the normal regression suite.

| Active-player AI + endTurn workload | Baseline median, ms | Proposed median, ms |
| --- | ---: | ---: |
| Open Frontier | 1.624 | 1.162 |
| Machine Dawn | 1.101 | 0.835 |
| Grand Frontier | 14.411 | 13.116 |
| Fallen Gates | 3.332 | 2.858 |
| Outer Rim | 2.346 | 1.845 |
| 64 stars / 256 worlds stress | 34.946 | 33.927 |

These are shared-cloud Node observations, excluding validation and comparison.
They are not browser frame times, GPU measurements or universal speedups. The
stress median difference is small and Machine Dawn's p95 increased slightly.
[Raw arrays and source hashes](evidence/command-upgrade/engine-reuse.json) and
[the OPT contract](OPT_CONTRACT.md) retain the budget, reference, stop condition,
tails and limitations. No raster backdrop cache was reintroduced.

## Verification

Local source checks on 12 November 2026:

- The unchanged baseline passed 83 Node tests. The final combined suite is recorded
  with source hashes in [node-tests.json](evidence/command-upgrade/node-tests.json).
- All new faction/route combinations complete through legal commands. The wider
  matrix covers **108 scenarios / 5,400 turns**, plus **5,400 independent replay
  turns**: two seeds, three difficulties, nine factions, both routes. Every state
  validates and every replay/save comparison matches. This fixed policy won all
  108 runs; that is not a human-playthrough or general balance guarantee.
  [Campaign receipt](evidence/command-upgrade/horizons-sweep.json).
- Native pack, bounded 32 KiB SDK and Workbench-layout roundtrips pass for the
  new packs; original v1 migration and large-save tests remain in the full suite.
- Native Canvas comparisons match every RGBA byte for all three planet palettes
  and four map size/DPR combinations, including repeated pan/zoom/mode redraws
  followed by a fresh reference. [Native receipt](evidence/command-upgrade/native-renderer.json).
  Native Canvas does not establish browser layout or GPU behavior.
- Local Chromium launch failed before opening any page because the environment
  denied socket creation. [Preserved attempt](evidence/command-upgrade/local-browser-attempt.json).
  No owner-workstation browser or self-hosted workflow was launched.

The ordinary pull-request workflow runs the existing baseline, expansion and
Workbench browser suites, plus `tests/command-browser.mjs`. The new suite exercises
briefings, real command/search controls, map pan/fit, fractional DPR, focus,
turn review, same-view scroll, settings persistence, narrow layouts, touch,
Canvas2D fallback and a new-faction offline save reload. Hosted results and
screenshots belong to their exact PR commit and are linked from the PR; preparing
the script alone is not a browser PASS.

Useful development failures were corrected before handoff: the existing Node DOM
harness needed the newly used animation-frame scheduling globals, and independent
review reproduced a delayed-briefing dialog race and repeated atlas-class scroll
restoration error. Regressions exercise the corrected behavior. The historical
failed backdrop-cache experiment and prior Workbench receipts remain unchanged.

### Reproduce

```sh
node --test tests/*.test.mjs
node scripts/site.mjs sync
node scripts/check.mjs
node scripts/site.mjs build _site
SEEDS=0,7 DIFFICULTIES=relaxed,standard,veteran node scripts/horizons-sweep.mjs
node scripts/benchmark-engine-reuse.mjs /path/to/unchanged-11c0fa5-checkout result.json
```

Browser tests require isolated Playwright tooling and an authorized environment;
the existing owner-workstation handover applies there. Normal hosted PR CI does
not control the owner's desktop. The workflow retains failures and screenshots.
Merge, Pages publication, tags and releases remain separate owner decisions.

## Compatibility

Runtime remains vanilla HTML/CSS/JavaScript with local assets and no new packages,
services or network dependencies. Native/SDK/Workbench budgets, save schema,
version-1 migration, autosave namespaces, installed-hook admission, exact arithmetic
and the 16-vertex ExactGraph boundary remain unchanged. Larger galaxies retain the
bounded BFS. New UI preferences extend the existing preference record with defaults.
The public package and scoped service-worker inventory include all new campaigns.
