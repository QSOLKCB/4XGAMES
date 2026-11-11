# Owner browser evidence — 12 November 2026

**Overall result: FAIL; expansion checks passed 12/13.** The cached map did not
match the uncached reference byte-for-byte. These are frozen observations of
`98d8e9727281f597f60d8b52ea109c3e8c79e5ed`, not evidence for later fixes.

Chrome 156, Linux x64, Node 22, with an NVIDIA/ANGLE rendering path.
Times in JSON are UTC. Detailed workstation metadata stays in local originals.
The owner explicitly authorized the window. Dedicated headed profiles used
Playwright protocol input and a local `/4XGAMES/` server. Owned processes were
closed before handing the machine back. No browser was launched to curate this
directory.

Public JSON receipts are **sanitized excerpts**, not byte-identical raw output.
Workstation paths, launch arguments, process identifiers and detailed hardware
metadata have been omitted. Outcomes and workload measurements are preserved.
[Publication hashes](../public-evidence-index.json) distinguish local originals
from these public files; original local recordings remain unchanged.

| Evidence | Result and scope |
| --- | --- |
| [Manifest](manifest.json) | Exact source/staged-file hashes and run times; overall FAIL retained |
| [Baseline receipt](baseline/browser-result.json) | Original suite: 18 checks PASS on untouched `b8de5866d6c6c66a4f81e6881b111aa50b173be6` |
| [Proposed legacy receipt](legacy-proposed/browser-result.json) | Same original suite: 18 checks PASS |
| [Expansion receipt](expansion/expansion-result.json) | 12 checks PASS, map parity FAIL; no page/HTTP/external-request errors |
| [Creator pack](expansion/creator-pack.json), [SDK pack](expansion/creator-sdk.json), [Workbench project](expansion/creator-workbench-project.json) | Actual UI exports, reimported and played |
| [Guided actions](guided/actions.json), [turn-13 state summary](guided/guided-gameplay.json) | Commands/results with local details omitted; agent-directed play, not a human playthrough |
| [Artifact inventory](artifact-inventory.json) | Original local SHA-256 and byte counts; `retainedHere` identifies a public artifact or sanitized excerpt, whose bytes may differ |

The expansion suite exercised all five campaigns and nine playable choices;
orders, colonies/queues, research, construction/refit, fleet groups, diplomacy,
combat, branch/event persistence, both v1 save fixtures, invalid content rejection,
48-colony/24-ship filtering, audio preferences, keyboard, emulated touch, narrow
layouts and offline reload. It is not a complete campaign playthrough. The
in-progress `progress.json` still says RUNNING after the final failure; the
retained final receipt and manifest are authoritative.

The guided session used controls to settle and survey in Open Frontier, then
played Grand Frontier through turn 13: two colonies, 13 surveyed systems,
Propulsion II, an archive recovery and the completed survey objective/grant.
One guided locator used the nonexistent `data-view="workshop"` and timed out;
the logged follow-up uses `data-view="mods"`. This is a probe error, separate
from the real rendering mismatch. Dense map labels overlap in the turn-13
screenshot; passing document-width assertions do not prove label readability.
A subsequent label-decluttering change is prepared; its browser verification is
pending a fresh owner gate, and this screenshot remains evidence of the old issue.

## Rendering, GPU and audio interpretation

[Render diagnosis](guided/render-diagnostic.json) records 10,010 differing
RGBA channel bytes at 600×420, maximum delta 11; 10,285 at 900×620, maximum delta 7.
[Raster-path diagnosis](guided/raster-path-diagnostic.json) records three exact
matches after temporarily requesting `willReadFrequently` contexts. This does not
validate a product fix. Raw timing arrays remain diagnostic observations because
correctness failed; no renderer speedup is claimed.

[CDP information](guided/gpu-info.json) and [WebGL diagnostics](expansion/gpu-diagnostics.json)
identify the active NVIDIA ANGLE renderer and enabled Canvas2D/compositing.
During explicit 121-frame redraw workloads, the GPU process recorded:

| Campaign | Duration | Raster decoder events | Compositor swaps |
| --- | --- | --- | --- |
| Machine Dawn | 2002.3 ms | 138 | 121 |
| Grand Frontier | 2009.5 ms | 146 | 121 |

[Trace event summary](trace-event-summary.json) identifies the GPU process from
trace metadata and retains exact event names, counts, raw-trace SHA-256 and paths.
Combined with the renderer information, this supports NVIDIA hardware GPU
participation during these workloads. It does not measure utilization or prove
that every drawing operation used the GPU. The receipt's software-renderer label
is a false positive from scanning `fallback-enabling launch option` in the command
line; no reported renderer identifies SwiftShader. Original local receipts remain
unchanged; the public excerpts omit those launch details.

[Guided large-campaign timing](guided/guided-gameplay.json) spans 25.8–34.3 ms
from DOM click capture to the second animation frame (12 samples, median 31.65 ms).
[Small-campaign timing](guided/small-performance.json) spans 26.6–31.9 ms
(eight samples, median 31.70 ms). The diagnostic heap observations were about
18.6 MB and 10.5 MB respectively; serialized saves were 34,849 and 17,304 bytes
at their recorded points. These are approximate, different-state observations,
not retained-memory bounds, input-device latency or a controlled speed comparison.

[Audio signal](guided/audio-signal.json) confirms nonzero output-connected
Web Audio samples. [Mute state](guided/audio-muted.json) shows `suspended` and
zero music voices; its analyser retains a stale nonzero buffer after suspension.
That sample is not evidence of a mute leak. No human listening or speaker output
was verified. Touch was emulated; no physical device was used.

## Screenshots

- [Untouched baseline](baseline/galaxy-desktop.png) and [Outer Rim](expansion/outer-rim-empire-0.png).
- [Created universe](expansion/created-universe.png), [combat report](expansion/combat-report.png), [320px workshop](expansion/narrow-320.png).
- [Preserved parity failure](expansion/failure.png), [guided turn 13](guided/guided-grand-turn13.png), [objective progress](guided/guided-objective-progress.png).

Other screenshots, logs, imported text fixtures and both raw GPU traces remain
under `test-results/owner-20261112-run2/`; their hashes are in
the inventory. The two traces total 14,062,171 bytes and are omitted from Git to
avoid committing large diagnostic recordings.

## Reproduction

Use isolated checkouts of the exact commits above and build each public stage
with `node scripts/site.mjs build <stage-directory>`. The manifest records stage
inventories and the unchanged legacy test source hash. See
[the owner handover](../../../OWNER_BROWSER_TEST.md) before any local browser run.
Only after fresh literal `proceed`, substitute your installed tooling and checkout
paths in this template:

```sh
VOIDWARD_OWNER_PROCEED=1 \
PLAYWRIGHT_MODULE="<installed-playwright-module>" \
BROWSER_EXECUTABLE="<browser-executable>" \
VOIDWARD_BASELINE_ROOT=baseline-checkout \
VOIDWARD_BASELINE_STAGE=baseline-stage \
VOIDWARD_OWNER_OUT="test-results/reproduction" \
node scripts/owner-browser.mjs
```

This command executes the suites, not the subsequent guided session. Guided
Playwright/evaluation command excerpts and results are in `guided/actions.json`.
To recount a retained local trace without launching anything:

```sh
python3 - <<'PY'
import collections, hashlib, json, pathlib
p = pathlib.Path('test-results/owner-20261112-run2/guided/gpu-trace-grand-frontier.json')
raw = p.read_bytes()
events = json.loads(raw)['traceEvents']
print(hashlib.sha256(raw).hexdigest())
counts = collections.Counter(event.get('name') for event in events)
print(counts['RasterDecoderImpl::DoRasterCHROMIUM'], counts['SkiaRenderer::SwapBuffers'])
PY
```
