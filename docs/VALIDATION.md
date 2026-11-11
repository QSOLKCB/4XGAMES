# Validation record

Implementation work: 12 November 2026 (Australia/Adelaide).

## Executed locally

- Node 24.22.1: all 18 simulation/content tests passed, including two campaigns
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

`tests/browser.mjs` is the packaged Chromium integration gate in hosted CI. It
covers the actual controls, module loading, navigation, construction, design,
research, saves, rejected imports, text-folder imports, legal mod victory,
source-campaign selection, Web Audio, 320/390px layouts, emulated touch, offline
reload and pixel parity. It emits screenshots, JSON results and raw texture-reuse
timings. Those checks must pass on the PR before treating it as browser-verified.

No physical mobile, GPU, cross-browser audio-byte, universal speedup or formal
proof claim is made. Performance observations require the renderer/runtime and
raw timings; cached work is never described as a cold reconstruction.
