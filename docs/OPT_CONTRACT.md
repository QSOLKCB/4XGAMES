# Bounded visual reuse

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
