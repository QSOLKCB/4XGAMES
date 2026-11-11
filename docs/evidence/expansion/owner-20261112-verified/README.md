# Owner verification — PASS, 12 November 2026

**All 14 expansion checks passed, plus 18/18 in each baseline/proposed legacy
suite.** Source: `381383e2c5a54c2e49c3516befb7942030607763`, clean tracked tree.
The [first-run failure](../owner-20261112/README.md) remains documented;
these results verify the corrections after a fresh literal `proceed`.

Chrome 156, Linux x64, Node 22, with an NVIDIA/ANGLE rendering path.
Dedicated headed profiles served the packaged game at `/4XGAMES/`
and accepted Playwright protocol input. Times are UTC in JSON. Owned browser/server processes closed before handing the machine
back. No browser was launched while curating this directory.

Public JSON receipts are **sanitized excerpts**, not byte-identical raw output.
Workstation paths, launch arguments, process identifiers and detailed hardware
metadata have been omitted. Test outcomes, source hashes and workload metrics
are preserved. [Publication hashes](../public-evidence-index.json) identify the
original local and public versions; local originals remain unchanged.

| Receipt | Executed result |
| --- | --- |
| [Manifest](manifest.json) | Exact source/stage inventory hashes, harness adaptations and suite times |
| [Baseline](baseline/browser-result.json) | 18/18 PASS on untouched `b8de5866d6c6c66a4f81e6881b111aa50b173be6` |
| [Proposed legacy suite](legacy-proposed/browser-result.json) | 18/18 PASS |
| [Expansion](expansion/expansion-result.json) | 14/14 PASS; zero page errors, failed HTTP requests or external requests |
| [Raw performance](expansion/performance-raw.json) | Complete zero-tolerance RGBA comparisons, raw timing arrays and memory/scene observations |
| [Artifact inventory](artifact-inventory.json) | Original local SHA-256, byte counts and retention status for all 73 source artifacts; public excerpts may differ |

All five campaigns and nine campaign/empire choices were exercised. The suite
also covered core orders, production/research, fleet grouping, ship creation and
refit, diplomacy/combat, branch/event persistence, v1 migration, rejected imports,
large lists, audio preferences, keyboard, narrow layouts, emulated touch and
offline reload. Actual creator exports are retained as [native pack](expansion/creator-pack.json),
[SDK pack](expansion/creator-sdk.json) and [Workbench project](expansion/creator-workbench-project.json);
they were reimported and played.

The restored direct backdrop path matched every RGBA byte at 600×420 and 900×620
in Machine Dawn and Grand Frontier; ocean/gas/ice planet palettes also matched.
Backdrop retention was zero entries/bytes. The dense-map fixture reported 32
selectable systems, 17 visible labels, 15 hidden crowded labels, zero visible
overlaps and complete accessible names. Keyboard focus revealed a crowded label.

The **2,429,209-byte** synthetic save passed file import, actual UI export,
switching to another campaign and reimport, with equality of every state field
and pack file. Single observed transfer times were 326.06, 67.68 and 298.76 ms
respectively, including Playwright and download/read overhead. This fixture was
not naturally played, and the 31.58 MB Node stress case was not browser-tested.
The large export stays local; SHA-256:
`41b60eeec89714751416da81ff8f3b25b6d0f24b8155183d3063cc6332102b15`.

## Performance and GPU scope

Five command-to-second-animation-frame samples per campaign had a 31.8 ms median:
Machine Dawn 27.1–32.1 ms, Grand Frontier 31.6–31.9 ms. These include simulation,
persistence and presentation, not physical input latency or completed GPU work.
Production uses the reference backdrop path; no backdrop speedup is claimed.
Approximate used-heap snapshots (53.19/41.89 MB) include previous tests and harness
objects in the shared profile and are not isolated campaign memory requirements.

[GPU diagnostics](expansion/gpu-diagnostics.json) identify the NVIDIA ANGLE
renderer with Canvas2D/compositing enabled and no software renderer reported.
Each bounded workload issued 121 redraws in about 2003 ms. The identified GPU
process recorded 183/125 raster decoder events and 121/120 compositor swaps
for Machine Dawn/Grand Frontier. Combined with renderer information, this
supports hardware GPU participation; it does not measure utilization or prove
exclusive GPU drawing. The automatic receipt deliberately leaves attribution
unverified until this trace interpretation.

[Trace summary](trace-event-summary.json) records exact event names, counts,
GPU-process event counts, SHA-256 and repository-relative artifact paths. The two raw traces total 17,062,785 bytes and
remain under `test-results/owner-20261112-verify1/expansion/`, alongside the large
save export. They are not committed. Counts include trace phases and are not
elapsed GPU execution times.

## Screenshots and limits

- [Dense chart with separated labels](expansion/large-chart-labels.png).
- [Created universe after roundtrip](expansion/created-universe.png).
- [320px workshop](expansion/narrow-320.png).
- [Ship designer and comparison](legacy-proposed/ship-designer.png).

Screenshots were inspected after execution. The wrapper's unchanged
`AUTOMATION_PASS_MANUAL_INSPECTION_PENDING` status refers to work outside its
automation. This window did not add human listening, speaker-output verification,
physical touch or a long campaign completion. The earlier agent-guided turn-13
session remains documented in the first evidence directory; it was not repeated
here. Later documentation/inventory commits do not imply another browser run.

## Reproduction

The source hashes identify local test checkpoints. The review branch uses a fresh
commit based on the original main, with sanitized public evidence; earlier
connector-created commits are not part of its history.

Use the review source and compare its runtime/test hashes with the recorded checkpoint, build with
`node scripts/site.mjs build _site`, and follow
[the owner handover](../../../OWNER_BROWSER_TEST.md) before any local browser
execution. The [earlier reproduction command](../owner-20261112/README.md#reproduction)
uses the same wrapper and installed tooling; use a new output directory. Never
set the owner-gate variable before a fresh literal `proceed`.

Regenerate the synthetic export and its digest without launching a browser:

```sh
node --input-type=module - <<'JS'
import {createHash} from 'node:crypto';
import {createLargeSaveFixture} from './tests/save-fixtures.mjs';
const {text} = await createLargeSaveFixture();
console.log(Buffer.byteLength(text), createHash('sha256').update(text).digest('hex'));
JS
```

The inventory identifies every omitted screenshot, log and raw recording by
hash. Screenshots and typed creator exports preserve their source bytes. JSON
diagnostic receipts are sanitized public excerpts; their original and public
digests are recorded separately.
