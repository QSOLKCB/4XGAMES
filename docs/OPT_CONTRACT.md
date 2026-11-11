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
