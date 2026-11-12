# Bounded visual reuse

## Command-deck canvas lifecycle

The Horizons renderer retains a canvas backing store while its required integer
pixel dimensions remain unchanged. The full image is still redrawn directly.
Star-control DOM nodes likewise survive zoom/pan/resize within one rendered view.

- **X:** assign canvas width/height on every draw, or only on actual size change.
- **F:** same source, logical viewport, rounded device-scale dimensions, campaign,
  selected system, fleet, map mode, zoom and pan.
- **f/d:** eliminate redundant canvas backing resets and preserve input focus.
- **C:** repeated redraw followed by the original view equals a freshly drawn
  reference in every RGBA channel; state remains unchanged and node focus survives.
- **B:** no extra retained pixel images; the existing bounded star samples and
  three planet textures remain. Fixed four native size/DPR cases and two browser
  fractional-DPR cases, with actual resize/pan/focus interaction checks.
- **S:** stop after fixed parity and lifecycle checks; no timing tuning or broad
  browser/GPU speedup claim follows from avoiding these assignments.

Native comparisons passed; see
[`native-renderer.json`](evidence/command-upgrade/native-renderer.json).
The PR workflow records browser parity separately. `tests/render-map.test.mjs`
counts real property assignments through the renderer's public interface and
checks projection alignment and state purity. Failure retains the reference
rendering path; there is no bitmap-backdrop admission to relax.

Applied reference: QSOLKCB/OPT, OPT-INV-001, pinned in vendor/PROVENANCE.json.

- **X:** regenerate a planet for every draw, or reuse the exact generated texture.
- **F:** identical palette, fixed light `[-0.55,0.45,0.7]`, 256×256 resolution,
  donor implementation and output pixels; no simulation side effects.
- **f/d:** minimise repeat-draw time and avoid repeat texture allocation.
- **C:** all RGBA bytes match the ordinary `bakePlanet` path for ocean/gas/ice;
  no change to planet population, economy, geometry or other state.
- **B:** three retained textures, two retained seeded backdrop samples; browser
  benchmark is five paired trials of twelve draws. No parameter tuning.
- **S:** stop after these trials; report environment-scoped observations only.

Classification: categorical, local, deterministic pixel objective with noisy wall
time, derivative-free, cheap bounded evaluation, exact semantics, sequential.

`paintPlanet` chooses only the three validated palettes and copies cached pixels
to a fresh target canvas. The cached source never escapes. Reference generation
remains available in the unmodified donor. Native Canvas parity was executed;
Chromium parity/timings passed in hosted run 43104269976; raw receipts live in
`docs/evidence/texture-reuse.json` and execution details in `VALIDATION.md`. If the lighting, resolution,
palette semantics or donor changes, update the cache identity and rerun parity.
On parity failure, revert to reference generation before claiming reusable output.

Audio caches also bind MIDI note, duration and AudioContext sample rate; changing
the campaign score cannot reuse a buffer for a different complete note key.
No target speedup figure is claimed without an executed browser result.

## Expansion workload and resource budget

The expanded engine deliberately performs more work: sensor snapshots, staged
objectives, events, fleet coordination, richer AI and strict migration admission.
Do not describe its timing difference from v1 as an optimisation speedup. The
preserved 64-star/256-world fixture and independently replayed workloads are in
`docs/evidence/expansion/`; run `scripts/benchmark.mjs` against either checkout.
The script accepts the checkout root, output path and 1–32 seeds. Every run has
at most 160 turns (120 for the preserved stress fixture). Correctness is validated
and deterministic hashes compared before publishing measurements.

The rejected cosmetic backdrop candidate was evaluated under this contract:

- **X:** redraw the fixed background, or copy a retained background canvas.
- **F:** same donor, seed, logical viewport, device scale, pixel dimensions and
  renderer revision; keep ownership, starlanes, orders and markers dynamic.
- **f/d:** reduce repeated map-render cost within a bounded memory footprint.
- **C:** every RGBA byte equals the explicit uncached `drawMap(...,{cache:false})`
  path. Rendering/audio leave authoritative state byte-for-byte unchanged.
- **B:** at most two backdrops and 24 MiB retained pixel storage; skip admission
  for a single image above 16 MiB. Two seeded star samples and three planet
  textures remain bounded separately. Audio retains at most 32 notes/16 MiB and
  four simultaneous music sources, in addition to the donor's effects limit.
- **S:** execute the fixed small/large owner-browser trials and stop. Retain the
  candidate only if parity passes and measurements show a useful benefit within
  noise; otherwise revert to the uncached reference. No tuning search is planned.

The 12 November 2026 owner test rejected the candidate: a 600×420 map had
10,010 differing channels (maximum delta 11) and a 900×620 map had 10,285
(maximum delta 7) on hardware-accelerated Chrome 156. A diagnostic
with both canvases explicitly preferring software readback matched, supporting
a raster-path-dependent explanation; this is not a reason to force software
rendering. Direct backdrop rendering is restored. No backdrop speedup is claimed,
and retained backdrop pixel storage is now zero. The bounded seeded star samples,
planet textures and audio notes remain.

After a fresh owner handover, source
`381383e2c5a54c2e49c3516befb7942030607763` passed all 14 expansion browser checks
on the same workstation. Production/reference map RGBA bytes matched exactly at
600×420 and 900×620 in Machine Dawn and Grand Frontier, as did all three planet
palettes. The receipt reports `mode: reference`, zero retained backdrop entries
and zero retained backdrop bytes. Five paired render-call trials per size are
retained; submillisecond differences near timer resolution are not a speedup.

The final suite recorded five command-to-second-animation-frame samples per
campaign: Machine Dawn 27.1–32.1 ms and Grand Frontier 31.6–31.9 ms, each with a
31.8 ms median. These include simulation, persistence and presentation; they are
not physical input-device latency or GPU-completion measurements. The approximate
heap snapshots (53.19 MB and 41.89 MB) include the shared browser/harness and prior
workloads, and cannot be compared as isolated campaign memory requirements.
[Raw measurements](evidence/expansion/owner-20261112-verified/expansion/performance-raw.json)
also retain DOM/canvas counts, save bytes and DPR.

Two ~2-second explicit redraw traces each covered 121 calls. Their GPU process
recorded 183/125 raster decoder events and 121/120 compositor swaps for the
small/large campaigns. Renderer and driver diagnostics identify the NVIDIA
NVIDIA GPU through ANGLE/OpenGL with Canvas and compositing enabled. Together
these support hardware GPU participation during the workload, not that all game
rendering or simulation ran on the GPU; trace counts are not utilization.
[Trace hashes and event counts](evidence/expansion/owner-20261112-verified/trace-event-summary.json)
identify the local raw recordings. No software fallback is reported by the
corrected renderer-only classification.

The original owner run remains a recorded **FAIL** for the rejected cache
candidate in [the first evidence directory](evidence/expansion/owner-20261112/README.md).
The [final verification](evidence/expansion/owner-20261112-verified/README.md)
establishes correctness after removal. Independent volume controls passed in
both windows; the first guided session measured output-connected nonzero audio.
Human listening and downstream speaker audibility remain unverified. Node fake
AudioContext tests establish bus/control semantics, not audible output or device
performance. Node process heap observations are not isolated allocation counts.
The workstation is not an isolated benchmark appliance; OS scheduling, GC and
other work can affect timings. There is no universal speed or memory claim.

## Command upgrade: exact AI ranking reuse and current observations

The command upgrade keeps the pinned VANILLAJS integer, rational and ExactGraph
modules unchanged. It reduces two repeated operations in `js/core.js`:

1. Each AI call ranks the available component catalogue once per role, reusing
   those rankings across its hull and slot choices. The six possible roles share
   at most one entry per eligible component; their minimum slot costs are also
   computed once. Research levels and catalogue values cannot change during the
   synchronous design phase. The maps are local to that call and are discarded
   when it returns. A different empire, state, research level or mod always gets
   fresh rankings, including a subsequent call in the same turn.
2. Each sensor snapshot scans the fleet once, accumulating strength and ship
   counts in original fleet order, and emits owners in the original empire
   order. Every observation is newly allocated. No observation cache survives
   a command, and last-seen reports continue to return their saved observations
   while a remote system lacks friendly sensors.

The bounded experiment is declared as follows:

- **X:** the untouched merged engine at
  `11c0fa582e1b28953f0df8f2a7a5f7217cb08953`, versus these two local changes.
- **F:** identical original campaign files, seeds, chosen empires, branches,
  difficulty, source hooks, legal-command policy and turn limits. No new rules,
  random draws or donor changes are part of this comparison.
- **f/d:** reduce repeated component filtering/sorting and repeated fleet scans.
  Observe elapsed time for player-policy AI plus the complete `endTurn` call.
- **C:** independent baseline and proposed states must serialize to identical
  bytes initially and after every step. Both states validate on every step,
  and final saves must deserialize identically. No fog, ordering, integer/rational
  or immutable-design contracts may change.
- **B:** 60 fixed workloads: all original playable empires and both routes where
  present, standard seeds 0/7/2401; first playable/first route at relaxed and
  veteran seed 7; two preserved 64-star/256-world stress fixtures. Stop at a
  winner or turn 160 (turn 120 for stress). One eight-step warmup per engine.
  Rankings retain at most six role lists during a call; a snapshot retains at
  most one force accumulator per empire. There is no persistent state cache.
- **S:** execute the fixed matrix once, alternating baseline/proposed execution
  order on successive steps. Stop and reject the candidate if any state differs.
  Report medians, p95 and full arrays without extending the matrix to find a
  favourable result.

Reproduce with an untouched detached checkout of the pinned baseline:

```sh
git worktree add --detach ../4XGAMES-opt-baseline 11c0fa582e1b28953f0df8f2a7a5f7217cb08953
node scripts/benchmark-engine-reuse.mjs ../4XGAMES-opt-baseline
node --test tests/optimization.test.mjs
```

The script verifies the baseline revision and clean runtime/content paths before
running. `test-results/engine-reuse.json` records exact source and pack hashes,
outcomes (including losses), final state hashes, full timing arrays and summaries.
The experiment excludes browser rendering, save persistence, input latency and
GPU work. Timings describe this fixed Node workload on a shared execution host;
they are not a whole-browser or universal speedup guarantee. The separate
regressions exercise current observation isolation, concealed remote changes,
cross-empire/research invalidation and changes to live catalogue values.

### Executed result, 12 November 2026

The fixed matrix passed **60/60 workloads and 4,393 steps**, with exact serialized
state equality at every checkpoint and successful independent save admission.
The [complete receipt](evidence/command-upgrade/engine-reuse.json) records source
hashes and every observation. Five compact baseline witnesses also run in the
normal Node suite, using the independently obtained baseline state hashes in
`tests/fixtures/engine-reuse-baseline.json`.

| Original workload | Paired steps | Baseline median / p95, ms | Proposed median / p95, ms |
| --- | ---: | ---: | ---: |
| Open Frontier | 162 | 1.624 / 3.654 | 1.162 / 3.146 |
| Machine Dawn | 70 | 1.101 / 2.190 | 0.835 / 2.226 |
| Grand Frontier | 1,980 | 14.411 / 45.406 | 13.116 / 41.773 |
| Fallen Gates | 1,380 | 3.332 / 18.283 | 2.858 / 16.916 |
| Outer Rim | 563 | 2.346 / 7.122 | 1.845 / 6.519 |
| Preserved 64-star / 256-world stress | 238 | 34.946 / 78.601 | 33.927 / 73.774 |

This execution used Node 24 on the cloud workspace, with other development work
on the shared host. Median observations were lower across this fixed matrix;
the stress median difference is only about 3%, and Machine Dawn's p95 increased
slightly. Do not interpret the result as a uniform latency improvement or compare
these absolute times directly with earlier workstation benchmarks. The reliable
claim is preserved authoritative behaviour with bounded elimination of repeated
catalogue rankings and fleet scans; the table is the observed timing consequence
for this execution. No further timing search was performed.
