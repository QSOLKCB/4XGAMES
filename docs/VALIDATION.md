# Validation record

Implementation work: 12 November 2026.

## Horizons / command deck — 12 November 2026

See [the current upgrade record](HORIZONS_UPGRADE.md#verification) and its
[source-hashed receipts](evidence/command-upgrade/) for this change. It builds on
merged 4XGAMES #4 at `11c0fa582e1b28953f0df8f2a7a5f7217cb08953`.
The records below remain historical evidence for their stated revisions.

## VANILLAJS #81 integration — 12 November 2026

PR #4 review follow-up addresses five editor defects: map attachment carryover,
unusable fixed-size/depth-tested gizmos, stale clean text buffers, unit-cube
picking for imported meshes, and admission of render-unsafe composed transforms.
Seven additional Node regressions and five browser scenarios cover the actual
transactions and pointer interactions. Donor files remain unchanged; fixes live
in local editor adapters. The new Node suite contains 83 tests; the PR records
the exact revision and hosted results for this follow-up independently of the
earlier runs below.

Base: `e2e2b2352428438d3ce377e5daff7b542a6dce10` (4XGAMES #3).
Donor: `b12f24f789da81325491f96b5c2dd786d31e96f0` (VANILLAJS #81).

This update adds the bundled editor, separate campaign history/recovery, staged
game/editor handoffs and complete hull attribution bundles. Existing campaign
files, authoritative simulation and save-codec files are unchanged. The new
Node authoring tests exercise independent histories, invalid transactions,
viewport coordinates, mixed mesh/primitive provenance, multi-source roundtrips,
bundle rejection and the actual packaged module dependency closure.

The full Node suite passes **76 tests**. The public inventory verifies **61
pinned donor files** and all five campaigns. The package includes every editor
entry point, stylesheet and transitive runtime module, including the optional
renderer's local WASM byte module. `tests/workbench-browser.mjs` extends hosted
QA with real viewport editing, recovery, 320px keyboard use, offline reload and
editor/game exchange while preserving an existing expedition.

Cloud Chromium launch was attempted and failed before opening a page:
`process_singleton_posix.cc:297: socket() failed: Operation not permitted`.
No UI pass or hardware result is claimed for that attempt. Hosted browser
results for this upgrade are reported separately in its PR/workflow artifacts.
The owner's workstation was not used. The [first hosted run](https://github.com/QSOLKCB/4XGAMES/actions/runs/43129136165)
passed all 18 baseline and 14 expansion checks, then the new Workbench test
failed at its offline game-tab wait with an undefined diagnostic global. The
wait now checks `globalThis` during initialisation. The [preserved first-run
summary](evidence/workbench/first-hosted-run.json) identifies the source, merge
revision and verified artifact digest; it is not an all-pass receipt.

The [second hosted run](https://github.com/QSOLKCB/4XGAMES/actions/runs/43129906668)
passed the 18 baseline, 14 expansion and 12 Workbench checks at head
`a35b488fafc70b9f070059e3e85156c9a29e8b53`. Its verified artifact ZIP digest is
`c7f6d5b3164262ae86516ddc62d8eec4f0014404300e4e7a9df70694fdacffa2`.
Visual inspection then found desktop viewport overflow after resizing from
320px back to 1440px. Local CSS now bounds the desktop grid row; an additional
browser assertion checks that the viewport and side panels stay above the footer.
That later layout change requires its own hosted result; the earlier 12-check
PASS does not cover it.

All expansion results below describe
their recorded historical sources, not this editor update.

Latest expansion browser verification: **PASS — 14/14 expansion checks and
18/18 checks in each legacy/baseline suite**, on source
`381383e2c5a54c2e49c3516befb7942030607763`.
[Final receipts and screenshots](evidence/expansion/owner-20261112-verified/README.md)
are separate from the preserved first-run failure below.
Published JSON receipts are sanitized excerpts: workstation paths, launch
arguments, process identifiers and detailed hardware metadata are omitted.
Original local recordings remain unchanged; [publication hashes](evidence/expansion/public-evidence-index.json)
identify original and public copies. Test outcomes and workload metrics are retained.

## Executed locally

- Node 24: all 18 simulation/content tests passed, including two campaigns
  across 32 seeds each, with independent identical runs and state validation
  after every turn. AI completed all campaign fixtures within 80 turns.
- Movement/exploration, colonisation, production/cancellation, capacity limits,
  component/faction/research checks, immutable ship snapshots, diplomacy,
  fleet combat, invasion, victory/defeat/scoring and save admission passed.
- Editable text values changed actual names, ship equipment and gameplay stats.
  Malformed packs, topology, silhouettes, unexpected state fields and illegal
  starting ships were rejected. The Machine Dawn event and validation-time hook
  isolation were exercised.
- All pinned donor bytes verified against SHA-256 in vendor/PROVENANCE.json.
- Native Canvas rendering through the environment's preinstalled
  `@napi-rs/canvas`: all three cached planet palettes matched the donor renderer
  in every RGBA byte. Ship-family and galaxy canvases rendered and were visually
  inspected. This is **not** a browser layout or Web Audio execution result.
- Runtime and test syntax checked; the public deployment allowlist and complete
  service-worker cache inventory verified.

## Local browser attempts — blocked

Playwright 1.62.1 could resolve, but system Chromium failed before opening a page:
`process_singleton_posix.cc:297: socket() failed: Operation not permitted`.
The packaged browser binary was not preinstalled. The request to run Chromium
outside the sandbox was rejected because this environment disables sandbox
approval. The shared Chrome surface could not load the local preview either.
These attempts did not execute the game UI and are not browser PASS evidence.

## Hosted Chromium — passed

GitHub Actions run [43104269976](https://github.com/QSOLKCB/4XGAMES/actions/runs/43104269976)
passed on source head `4117607e850d15263c836f3a483e085f334b4853`, using
Playwright 1.62.1 with system Chromium **156**, Ubuntu 24.04 and Node 24.
The PR checkout was GitHub's generated merge commit
`890358f35cd7012178e7cb62711e97f56fcb4d19`.

`tests/browser.mjs` served the staged public package under `/4XGAMES/`, then
exercised actual controls for movement, colonisation, construction/cancel,
research, ship design, all command views, Web Audio, save roundtrip and rejected
save admission, reload, editable directory-mod import, legal mod victory,
registered-source campaign selection, narrow layouts, offline play and emulated
touch. Result: **17 checks passed**, zero page errors, zero HTTP failures and
zero external runtime requests. The 1440×1000 desktop and 390/320px screenshots
were inspected. A follow-up adds keyboard/form/dialog checks; consult the latest
PR run for that result.

Artifact `13893860111` (14-day retention) contains the screenshots,
`browser-result.json`, imported campaign fixture and `texture-reuse.json`.
ZIP SHA-256: `42a12f516c0ecd7b5b730c169f242cbf1d26f5e993fe69b451106b6b9a9f613a`.
The two JSON receipts are retained in `docs/evidence/` for durable inspection.

All RGBA bytes matched for ocean/gas/ice textures. Five trials of 12 redraws
recorded reference regeneration at 150.0–157.8 ms and cached copying at
0.1–0.3 ms. These are scoped warm-reuse observations at browser timer resolution,
not a cold-render or whole-game speedup claim; see `OPT_CONTRACT.md`.

### Preserved first failure

Run [43103419241](https://github.com/QSOLKCB/4XGAMES/actions/runs/43103419241)
reached custom-mod victory and then failed because the test's unscoped
“Campaign workshop” button locator matched both the navigation and designer
shortcut. The test now scopes navigation to its nav element. Artifact
`13891594352` retains the earlier screenshots/timing evidence; ZIP SHA-256:
`61cdcbb38c30ef43bb67e6d44c11558a91782bb4517fb91fff741ca73db7975f`.
That run is not a browser PASS.

That historical run supports no physical mobile, GPU, cross-browser audio-byte,
universal speedup or formal proof claim. Performance observations require the renderer/runtime and
raw timings; cached work is never described as a cold reconstruction.

## Universe expansion — implementation and browser evidence

Baseline main is `b8de5866d6c6c66a4f81e6881b111aa50b173be6`. It was cloned into a
new checkout; no AGENTS.md exists in that repository or its applicable ancestors.
README, mod guide, source architecture, all original packs, tests and provenance
were inspected. An untouched detached baseline checkout and staged package are
retained for the browser comparison. At the owner's request, implementation was
prepared before the browser handover. After literal `proceed`, the untouched
baseline and proposed packages were exercised on the owner workstation; the
dated results below preserve this sequence and the failed rendering check.

Executed on Node 22, Linux x64:

- **61 named Node tests pass:** 18 existing, 21 strategy/migration, 14 authoring,
  five presentation contracts and three campaign tests (six legal completion
  routes). The `--test` wrapper exposes file-level aggregates in this environment;
  direct invocation records every named test in
  [node-tests.json](evidence/expansion/node-tests.json).
- The new standard-difficulty sweep covers three seeds (0, 7, 2401), every new
  playable empire and both routes: **42 runs, 3432 played turns**, plus a complete
  independent replay of every run. All states validate and all replay hashes
  match. Grand Frontier ends at turn 100 in these policy runs, Fallen Gates at 70,
  Outer Rim at 47–90 (early conquest/defeat is possible). Player wins are 6/18,
  12/18 and 5/6 respectively. These are one automated policy's outcomes, not a
  balance guarantee or a manual playthrough. Exact code hashes and receipts are
  in [campaign-sweep.json](evidence/expansion/campaign-sweep.json).
- A further **28 relaxed/veteran runs** (seed 0, every new playable empire and
  route) completed 2258 turns plus matching independent replays; 13 were player
  wins. [Difficulty receipts](evidence/expansion/campaign-difficulties.json)
  preserve losses too. These settings change war timing, not a guaranteed ordering
  of outcomes: the fixed Outer Rim endurance policy lost on relaxed at turn 36
  but won on veteran at 90. Scripted event schedules are unchanged by difficulty.
  Human assessment of long-campaign balance remains unverified.
- Both original campaign directories remain unchanged. Real v1 turn-five saves
  from both packs migrate, preserving balances, ships, queues and installed hook
  state. Invalid migrated fields, commands and authoring edits are rejected.
- The tutorial code creates an original ring map/courier hull, exports, reimports,
  validates and advances a legal game turn. Tests use the actual unchanged donor
  Workbench parsers and Mod SDK registry. Every new shipped map roundtrips through
  the fixed 2:1 Workbench coordinate bridge. These are Node authoring witnesses;
  the browser authoring roundtrip also passed on the tested commit below.

### Corrections after the first owner window

The original local failed browser receipt remains unchanged. The proposed raster
backdrop cache was removed, crowded star labels now retain selection/keyboard
access while hiding collisions, and GPU classification reads actual renderer
fields rather than fallback command-line flags. A separately authorized owner
window verified these changes; the final results are recorded below.

A separate review reproduced valid saves exceeding the old import ceiling.
Compact export and shared bounded UTF-8 admission now cover the existing schema;
old pretty-printed saves remain supported. Four regression cases and a validated
2.43 MB fixture cover export/import. The measured 31.58 MB schema-boundary fixture
roundtrips exactly; [SAVE_LIMITS.md](SAVE_LIMITS.md) gives its budget, timings,
memory observations and browser/local-storage limitations.

**68 named Node tests pass after these fixes**: the original 61 plus three GPU
classification and four save-codec regressions. All suite TAP output and exact
runtime/test source hashes are in
[node-tests-postfix.json](evidence/expansion/node-tests-postfix.json). No browser
was launched by this Node check. The subsequent browser suite also passed
actual large-save UI export/reimport and dense-chart label geometry.

### Measured engine costs

Four seeds, standard difficulty, idle human, installed hooks; bounded campaign
runs and a preserved 64-star/256-world stress fixture to turn 120. Each run has an
independent deterministic replay. Values are milliseconds, median / p95:

| Workload | Main v1 endTurn | Expanded endTurn | Expanded clone + validate + serialise |
| --- | --- | --- | --- |
| Machine Dawn | 0.308 / 0.874 | 0.661 / 1.519 | 0.647 / 0.921 |
| Open Frontier | 0.401 / 1.043 | 0.860 / 1.860 | 1.050 / 1.795 |
| Grand Frontier | Not shipped in v1 | 2.930 / 17.264 | 1.872 / 2.839 |
| Fallen Gates | Not shipped in v1 | 2.133 / 9.662 | 1.373 / 2.019 |
| Outer Rim | Not shipped in v1 | 1.041 / 1.848 | 1.112 / 1.633 |
| 64 stars / 256 worlds | 3.355 / 6.574 | 16.861 / 33.736 | 2.685 / 3.035 |

The expanded simulation is slower because it computes additional gameplay and
information. No engine speedup is claimed. Maximum serialised stress states were
about 125 KB in this workload. Authoritative state/replay parity is checked within
each version; new AI/warfare behavior intentionally differs from v1. The reference
run and expanded run are separate workstation observations, not controlled browser
A/B results. Raw arrays, workload definitions, process-heap observations and source
hashes are in [expanded-engine.json](evidence/expansion/expanded-engine.json) and
[reference-engine.json](evidence/expansion/reference-engine.json). The earlier
16-seed baseline measurement remains in [baseline-engine.json](evidence/expansion/baseline-engine.json).

### Preserved failures and verification limits

Initial content generation rejected overlapping Outer Rim home ownership with a
correct `starts.txt:4:colonies` diagnostic; the authored start was corrected.
An early branch implementation incorrectly excluded later stages on the same
route; dedicated tests now cover route semantics. A completion witness initially
assumed that the player won every seed: the empire legitimately lost to a rival.
The test now uses measured fixed winning witnesses while the multi-seed sweep
retains losses. Earlier iteration results are preserved separately; they are not
substituted for the final code-hashed sweep.

### First owner browser window — preserved failure, 12 November 2026

Tested proposed commit **`98d8e9727281f597f60d8b52ea109c3e8c79e5ed`** and untouched
baseline `b8de5866d6c6c66a4f81e6881b111aa50b173be6`, both with clean tracked trees.
The browser was Chrome 156 on Linux x64, Node 22, using an NVIDIA/ANGLE path.
Detailed hardware metadata is retained only in local originals. Headed profiles served
the package at `/4XGAMES/`; input used Playwright's browser protocol. The owner
gave `proceed` before testing and was told the machine was free after owned
browser processes and servers closed. Another browser run requires a fresh gate.

| Executed suite | Result |
| --- | --- |
| Untouched baseline, original browser suite | PASS: 18 checks |
| Proposed package, same original suite | PASS: 18 checks |
| Expansion suite | **FAIL overall: 12 of 13 checks passed** |

Expansion checks passed for all five campaigns and nine campaign/empire choices;
exploration, settlement, production/reordering, research, fleet groups and return
orders, design construction/refit, diplomacy/combat, persistent branch/event
progress, both v1 save migrations, rejected imports, large-list filtering,
independent audio preferences, keyboard/form/dialog behavior, 390/320px layouts,
emulated touch and offline reload. The actual visual workshop exported a changed
map/hull through Workbench, native pack and bounded SDK formats, reimported and
played it. There were zero page errors, HTTP failures or external runtime requests.
Receipts, exported content and representative screenshots are retained in the
[owner evidence directory](evidence/expansion/owner-20261112/README.md).

The thirteenth check found a **real cached/reference map RGBA mismatch** and
stopped the automated performance block. Guided diagnosis on the same source
confirmed 10,010 differing channel bytes at 600×420 (maximum delta 11) and 10,285
at 900×620 (maximum delta 7). A temporary `willReadFrequently` diagnostic made
three comparisons match; this was browser instrumentation, not a shipped fix or
a passing rerun. The failure screenshot and raw receipts remain intact. Later
source changes are not covered by this browser result.

Separately, guided agent play used the real controls: Open Frontier survey and
settlement, then Grand Frontier to turn 13 with two colonies, 13 surveyed systems,
Propulsion II, an archive recovery, a completed survey objective and its grant.
This was agent-directed play with screenshot inspection, not a human playthrough
or campaign completion. The turn-13 screenshot also exposes overlapping labels
on the dense 64-star map; document-overflow checks did not detect that limitation.
The subsequent label-decluttering fix passed the separately authorized
verification below; the original screenshot remains preserved.

Guided redraw traces captured 121 game redraws per campaign in approximately two
seconds. CDP and WebGL identify the NVIDIA renderer with Canvas2D/compositing
enabled; the same GPU process contains raster and compositor events during both
workloads. This supports hardware GPU participation, without establishing that
every Canvas operation ran there or measuring GPU utilization. The original
receipt's `SOFTWARE_RENDERER_DETECTED` label is a false positive: its broad regex
matched the `fallback-enabling launch option` command-line flag. The corrected
interpretation and trace hashes/counts are documented alongside sanitized public
excerpts; original receipts and approximately 14 MB of raw traces remain local.

Guided command-to-second-animation-frame observations were 25.8–34.3 ms for 12
Grand Frontier turns (median 31.65 ms), and 26.6–31.9 ms for eight Machine Dawn
turns (median 31.70 ms). These include simulation, persistence and rendering;
they are not physical input latency or a controlled baseline speed comparison.
Approximate JS heap/save observations and raw redraw timings are retained, but
the failed parity contract prevents a renderer optimization success claim.

Web Audio produced a nonzero output-connected signal, and muting reported a
suspended context with zero music voices. The nonzero analyser sample after
suspension is a stale buffer, not evidence of continuing sound. No human
listening, speaker-output verification, physical touch or long browser campaign
completion is claimed. This first window does not verify later fixes. The historical hosted evidence
above belongs to the previous release. See [OWNER_BROWSER_TEST.md](OWNER_BROWSER_TEST.md)
for the handover procedure and [the dated README](evidence/expansion/owner-20261112/README.md)
for reproduction and artifact interpretation.

### Final owner verification — PASS, 12 November 2026

After a fresh literal `proceed`, the same workstation and browser tested clean
source **`381383e2c5a54c2e49c3516befb7942030607763`**. The untouched baseline
and proposed legacy suites each passed all 18 checks; the expansion suite passed
**all 14 checks**, including the added large-save regression. There were no page
errors, failed HTTP requests or external runtime requests. Dedicated browser
processes and local servers closed before the owner was told the machine was free.
The [manifest](evidence/expansion/owner-20261112-verified/manifest.json) records
source/staged-file hashes, harness adaptations and exact times.

The restored direct backdrop path matched every reference RGBA byte at 600×420
and 900×620 in both small and large campaigns. All three planet palettes also
matched. Retained backdrop pixel storage was zero. The dense-chart fixture had
32 selectable systems, 17 visible labels and 15 hidden crowded labels, with zero
visible overlaps, complete accessible names and full names revealed by keyboard
focus. This verifies the fixes without changing the old failure record.

The synthetic 2,429,209-byte save passed actual file import, UI export, switching
to a different campaign and reimport, with equality of every state field and pack
file. Single observed transfers were 326.06 ms to import, 67.68 ms to export and
read the download, and 298.76 ms to reimport. These include browser automation
overhead, and do not represent a naturally played campaign or a maximum-size
browser test. See [SAVE_LIMITS.md](SAVE_LIMITS.md).

Five command-to-second-animation-frame samples per campaign had a median of
31.8 ms: Machine Dawn ranged 27.1–32.1 ms and Grand Frontier 31.6–31.9 ms.
The [raw performance receipt](evidence/expansion/owner-20261112-verified/expansion/performance-raw.json)
also preserves render-call timings, DOM/canvas counts, save bytes and approximate
heap. No backdrop speedup is claimed: production uses the reference path, and
these timings do not measure physical input latency or GPU completion.

Two approximately two-second traces each covered 121 explicit redraws. Their
identified GPU process recorded 183/125 raster decoder events and 121/120
compositor swaps for Machine Dawn/Grand Frontier. Combined with the NVIDIA ANGLE
renderer and enabled Canvas/compositing, this supports hardware participation
during the workloads, without proving exclusive GPU execution or utilization.
The [trace summary](evidence/expansion/owner-20261112-verified/trace-event-summary.json)
retains exact names, counts, hashes and local raw-trace paths.

All campaign choices, authoring roundtrips, v1 migrations, progression, invalid
imports, controls, audio preferences, emulated touch and offline behavior were
rerun. Representative screenshots were inspected. This window did not repeat
the earlier guided turn-13 session or add human listening, physical touch or a
long campaign completion. The wrapper's unchanged
`AUTOMATION_PASS_MANUAL_INSPECTION_PENDING` status distinguishes its automated
result from those separate activities. The
[final evidence README](evidence/expansion/owner-20261112-verified/README.md)
explains reproduction and remaining limits.
