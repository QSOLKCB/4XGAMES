# Owner workstation test handover

The owner requires an explicit start gate. Preparing code, fixtures and Node tests
does not authorize launching or controlling a browser.

Immediately before the browser window, stop all implementation and delegated
work. State the workload, input/desktop access and estimated duration in the CLI,
then wait for the owner's literal **proceed**. Do not treat silence as approval.
Repeat this handover before a later test that takes control of the desktop.

## Planned workload

Allow approximately **20–30 minutes**, including screenshot inspection and a
short representative gameplay session. Automation uses a separate browser
profile and Playwright's browser protocol. It does not drive the operating
system pointer, type into other applications, or use the owner's normal profile.
A headed browser window may take focus. Stop browser automation and its local
HTTP server before telling the owner the machine is available again.

1. Play untouched main `b8de5866d6c6c66a4f81e6881b111aa50b173be6` from the
   preserved `baseline-checkout` checkout. Run its existing packaged
   browser suite; retain baseline screenshots and its result, including failures.
2. Build and serve the proposed game under `/4XGAMES/`. Run existing gameplay,
   keyboard, touch emulation, save/import rejection and offline checks.
3. Exercise every installed campaign and every declared playable empire. Check
   home selection, ownership, research, colony production and legal end-turn.
   Play representative exploration, settlement, group travel, construction,
   refit, diplomacy and combat; inspect the resulting dispatches.
4. Use the campaign workshop to create a universe, change map links/coordinates,
   empire starts, hull geometry and objective data. Validate, export, import and
   launch it. Import a real Workbench Asset Foundry project; inspect the projected
   silhouette and retained licence metadata. Check invalid edits preserve the
   active game and that unsupported code-bearing formats are rejected.
5. Import both preserved version-1 saves, export the migrated result and reload.
   Check campaign progress and once-only events persist. Check branch choices.
6. Inspect desktop at 1440×1000 and narrow layouts at 390 and 320 pixels. Exercise
   keyboard focus, dialogs, form suppression, emulated touch, reduced motion,
   independent music/effects volume and mute. Listen to generated sound when the
   workstation audio output permits; graph creation alone is not a listening test.
7. Reload offline after complete service-worker installation. Check a fresh
   `/4XGAMES/` subpath context and absence of external runtime requests.
8. Measure bounded small/large workloads: command-to-paint latency, redraw cost,
   approximate JS heap where available, DOM/canvas counts, save bytes and cache
   bounds. Compare complete RGBA bytes with the uncached rendering reference.
   Retain raw trials, browser version, CPU and GPU diagnostics.

## GPU verification

Capture Chromium CDP `SystemInfo.getInfo`, including GPU devices, feature status,
driver and renderer strings. Also capture a WebGL renderer where available.
Identify SwiftShader, llvmpipe or another software renderer explicitly. Hardware
presence alone does **not** establish that the game used GPU acceleration.
Record Canvas/compositing feature status and report **unverified** when the
diagnostics cannot establish the actual path. No GPU use or speedup claim should
be made from a successful launch or screenshots alone.

## Evidence and completion

Write artifacts into `test-results/owner-<timestamp>/` and preserve a manifest
with the tested commit/tree, commands, outcomes and browser diagnostics. Keep
failure screenshots and error logs. Screenshots are visual evidence, not proof
that every gameplay path works. Label emulated touch, automated gameplay and
manual inspection separately.

After the run, close owned browser contexts/processes and server, report that
the owner can use the machine again, and give the evidence location. Continue
non-browser fixes and GitHub preparation. Obtain a fresh handover before any
subsequent desktop-control test. Push through the GitHub connector, open reviewable
PRs, and leave merge, release publication and CI review to the owner.

## Verification after the first owner run

The first window finished and all owned browser/server processes closed. Its
original recordings remain local; sanitized public excerpts are in
`docs/evidence/expansion/owner-20261112/`. The proposed
backdrop cache failed exact RGBA parity and was removed; dense star labels were
also corrected. A subsequent review found a large-save export/import limit
mismatch, now fixed with shared bounded UTF-8 admission and a validated fixture.

The owner supplied **a new literal proceed** for the 5–10 minute verification
window. Source `381383e2c5a54c2e49c3516befb7942030607763` was tested with the same
dedicated profiles and browser protocol; no operating-system pointer, other
application or normal user profile was controlled. The executed checks covered:

- Exact planet/map pixel parity and small/large rendering/GPU traces after cache removal.
- Dense 64-star chart labels, preserved accessible names and full labels on keyboard focus.
- Actual UI upload, export, campaign switching and reimport of a 2.43 MB validated synthetic save, with full-state equality and transfer timings.
- All campaign/empire choices, gameplay and creator flows, old saves, keyboard,
  emulated touch, narrow layouts and offline reload under `/4XGAMES/`.

All **14 expansion checks passed**, alongside **18/18 checks in each original
baseline/proposed suite**. Exact rendering parity, dense-label geometry and the
2,429,209-byte UI save roundtrip passed. There were no page errors, failed HTTP
requests or external runtime requests. Screenshots were inspected; browser
processes and local servers were verified closed before handing the machine back.

The large-save fixture is synthetic admission evidence, not a natural playthrough.
The 31.58 MB schema stress fixture was measured separately in Node and was not
part of this browser workload. The original local failure evidence remains unchanged;
[final receipts, screenshots and trace summaries](evidence/expansion/owner-20261112-verified/README.md)
are retained separately. Human listening, physical touch and long browser
campaign completion remain unverified. Any further local browser window requires
another explicit handover and literal `proceed`.

Public evidence excludes workstation paths, browser launch arguments, process
identifiers and detailed hardware metadata. Keep those details in local originals;
publish outcomes, workload metrics, coarse environment and source/artifact hashes.
Use [the publication index](evidence/expansion/public-evidence-index.json) to
distinguish original receipt digests from sanitized public-file digests.
