# Working on VOIDWARD

VOIDWARD is an offline-first, moddable, turn-based space 4X for GitHub Pages.
These instructions apply throughout this repository. Follow the owner's current
task and existing authorisations; make routine reversible implementation choices
without repeatedly asking permission.

## Start with the current source

- Read `README.md`, `MOD_GUIDE.md`, the relevant guides in `docs/`, and the code
  being changed. Inspect the working tree before editing; preserve unrelated work.
- Use a focused branch from the current target commit. Record the tested commit
  or tree, commands and actual outcomes when reporting work.
- Implement and verify the requested change. A plan is preparation, not the
  deliverable. Keep PRs coherent and documentation aligned with shipped behaviour.

## Architecture and tooling

| Path | Responsibility |
| --- | --- |
| `js/core.js` | Deterministic turns, commands, AI, combat, objectives and state validation/migration |
| `js/content.js` | Text-pack schemas, bounds and file/line/field diagnostics |
| `js/save-codec.js` | Shared bounded UTF-8 save admission and encoding |
| `js/app.js` | Player controls, views, command transactions and saves |
| `js/workshop.js`, `js/workbench-bridge.js` | Authoring operations and validated donor-format exchange |
| `js/render.js`, `js/audio.js` | Presentation, procedural assets and audio |
| `mods/` | Editable campaign data and explicitly registered source hooks |
| `vendor/PROVENANCE.json` | Exact donor revisions, file hashes and contributions |
| `scripts/site.mjs`, `sw.js` | Public package inventory and generated offline cache |
| `tests/`, `docs/evidence/` | Regression coverage and dated execution evidence |

Keep the runtime vanilla HTML/CSS/JavaScript with local assets. Prefer native web
APIs and small adapters. Avoid adding frameworks, runtime npm dependencies,
backend services, Docker, Kubernetes or cloud dependencies by default. Existing
Node tooling and isolated Playwright are development dependencies. Prefer `uv run`
and the Python standard library for Python utilities; use `uvx` for one-off tools
when needed. Do not introduce manual virtual-environment setup unnecessarily.

## Gameplay, mods and compatibility

- Keep authoritative gameplay deterministic for a seed and command sequence.
  Rendering, audio, wall-clock time and ambient randomness must not change it.
- Preserve integer/rational contracts and declared bounds. AI must issue legal
  commands and respect the selected empire's current/last-seen information.
- Validate candidate commands, imports and authoring changes before replacing the
  active state or draft. Invalid content must leave the current expedition intact.
- Keep names, rules, maps, ships, objectives and supported events in documented
  editable data. Use `js/content.js` as the schema authority; update diagnostics,
  examples and guides alongside format changes.
- Imported text/native/SDK packs are inert data. Do not evaluate expressions,
  load code from pack URLs or activate hooks merely because an ID matches.
  Trusted source hooks are statically registered in `mods/registry.js`.
- Preserve version-1 migration and existing campaign/save compatibility. If a
  requested change needs a new schema, implement and test explicit migration or
  rejection with a useful explanation. Keep export/import budgets consistent in
  `js/save-codec.js`; see `docs/SAVE_LIMITS.md`.
- Preserve original campaign data unless the task calls for changing it.
  `scripts/generate-campaigns.mjs` replaces generated campaign files: inspect
  local edits before running it. Pack edits must survive export/import/play.
- Keep vendored donor files unchanged. Implement adaptations outside `vendor/`;
  deliberate donor upgrades must pin the new revision, update hashes/attribution,
  preserve licences and validate the actual integration. Respect independent
  Workbench, Mod SDK and ExactGraph bounds.

## Verification appropriate to the change

For gameplay, state, content, save or authoring changes, run the relevant regression
suites and the complete existing Node suite before handoff:

```sh
node --test tests/*.test.mjs
node scripts/site.mjs sync
node scripts/check.mjs
node scripts/site.mjs build _site
```

For documentation/artwork-only changes, inspect the rendered result, check links
and run the inventory/staging checks above; the full gameplay suite is not needed
unless the change affects its behaviour. Do not add tests that merely duplicate
implementation or rerun unrelated benchmarks without a reason.

The public package is an explicit allowlist. New README/game assets must be
included deliberately. `sw.js` is generated: refresh it with `site.mjs sync`
after edits to included files, including README/docs. Never hand-edit its digest.
Keep the deployed `/4XGAMES/` subpath, offline reload and cache-scope isolation working.

For UI/runtime changes, exercise the packaged game using `tests/browser.mjs` and
`tests/expansion-browser.mjs` in an authorised browser environment. Cover relevant
campaign/empire choices, authoring roundtrips, malformed imports, keyboard,
narrow screens and offline operation. The owner-workstation gate below applies
before local browser execution there; ordinary hosted CI does not control that desktop.

For performance changes, follow `docs/OPT_CONTRACT.md`: declare the workload,
correctness constraints, budget and stop condition; preserve reference behaviour
and collect scoped measurements. A hardware name, screenshot or successful launch
alone is not evidence of GPU use or a speedup. Correctness outranks speed.

Preserve useful failures and distinguish executed checks from assumptions.
Separate Node simulation, automated browser checks, agent-guided play, human
listening and physical-device tests. Never relabel old evidence as testing a new
commit. Keep full workstation diagnostics local; publish sanitised evidence with
source/artifact hashes as described in `docs/OWNER_BROWSER_TEST.md`.

## Owner-workstation browser handover — mandatory

The owner authorises CPU/GPU browser testing only within an explicit test window.
Code, fixtures and non-browser checks may be prepared beforehand.

1. Immediately before launching or controlling any browser test on the owner's
   machine, **stop all work**, including any delegated/background implementation.
2. State the planned workload, whether keyboard/mouse/desktop control is involved,
   and the expected duration. Wait for the owner to literally say **`proceed`**
   in that session. Silence, an old approval or a historical receipt is not consent.
3. After that message, run the planned test autonomously using an isolated profile.
   Follow `docs/OWNER_BROWSER_TEST.md`; record the actual rendering path and results.
4. Finish browser/input automation and close only owned test processes and servers.
   Clearly tell the owner the machine is available again and where evidence lives,
   then resume ordinary fixes and GitHub preparation.
5. Repeat the handover before a later owner-workstation browser test window.

Never set an owner-approval environment flag in advance of the fresh approval.
The handover authorises the described test, not unrelated desktop activity.

## GitHub handoff

Use the GitHub connector for branch/commit pushes and PRs when available. Check
the remote head and use an expected-SHA lease for ref updates. If the connector
is unavailable, preserve local commits and report the blocked push accurately.

Open a reviewable PR with the player-visible change, relevant validation, exact
tested revision, screenshots when useful, and material compatibility limits.
Leave **merge review, CI review, merging, tags and release publication to the
owner** unless they explicitly authorise those actions. Normal PR/main workflow
triggers are expected. Do not manually dispatch owner/self-hosted jobs without
their applicable authorisation. Keep Pages deployment restricted to validated main.
