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

## Hosted Chromium — passed

GitHub Actions run [43104269976](https://github.com/QSOLKCB/4XGAMES/actions/runs/43104269976)
passed on source head `4117607e850d15263c836f3a483e085f334b4853`, using
Playwright 1.62.1 with system Chromium **156.0.8078.0**, Ubuntu 24.04 and Node 24.
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

No physical mobile, GPU, cross-browser audio-byte, universal speedup or formal
proof claim is made. Performance observations require the renderer/runtime and
raw timings; cached work is never described as a cold reconstruction.
