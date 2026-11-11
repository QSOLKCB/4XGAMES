# Portable save size and admission

Portable saves use compact JSON with a **49 MiB UTF-8 envelope limit** and a
**48 MiB UTF-8 state limit**. One MiB is 1,048,576 bytes. The remaining envelope
budget accommodates the validated text pack (at most 500,000 UTF-8 bytes) and
metadata. The format remains `voidward.save.v1`; older pretty-printed envelopes
under the envelope limit still load. Original state versions are migrated after
size, envelope and pack checks.

`js/save-codec.js` supplies the limits and encoding/decoding used by file uploads,
manual exports, autosaves and engine state decoding. Export checks the resulting
text before creating a download. Import checks its encoded byte size before
JSON parsing, then validates the complete pack and state before activation.
Imported JSON does not select executable hooks unless its installed campaign
identity and complete text hash match the registered source campaign.

The previous 2,000,000-character envelope and 1,500,000-character state ceilings
were smaller than structurally valid long-campaign saves. Pretty indentation
could also push an otherwise loadable compact save over the envelope ceiling.
The regression fixture exports 2,429,209 bytes through the actual compact codec
and restores every state field. The separately authorized 12 November browser
verification also passed file upload, actual UI export, switching to a different
campaign and reimport, comparing every state field and pack file after each step.

## Schema budget

The ceiling follows the existing bounded schema; it does not increase map,
fleet, queue or history capacities. To budget arbitrary admitted strings,
allow six JSON bytes per UTF-16 code unit (for example U+0001 becomes `\u0001`).
The rounded allowances below include punctuation, field names and bounded
numbers. They deliberately add maxima that ordinary play may never reach
together.

| State section | Existing maximum | Conservative compact JSON allowance |
| --- | --- | ---: |
| Completion history | 30 reports × (256 worlds + 360 ships), 200-character labels | 24 MB |
| Worlds and construction | 256 worlds × 128 facility counts and five queued design snapshots, 40 components per design | 7 MB |
| Active ships and refits | 360 ships, each with an existing and refit design snapshot | 3 MB |
| Empire designs and technology | Six empires × 24 designs and 128 research fields | 1 MB |
| Intelligence, maps, logs, battles, survey history and scenario state | Their separately validated record/string limits | 3 MB |
| **Rounded combined allowance** | **Existing schema only** | **38 MB** |

The 48 MiB state ceiling leaves margin above that conservative 38 MB allowance.
Recalculate this budget when changing record counts, identifier lengths, history
retention or string bounds. Do not silently raise the file limit without a
structural budget, rejection tests and a new resource measurement.

## Executed Node observation

Reproduce the synthetic boundary measurement with:

```sh
node --expose-gc scripts/benchmark-saves.mjs
node tests/save-codec.test.mjs
```

The fixture has 64 systems, 256 worlds, six empires, 128 facility types, 360
ships/refits, 1,280 queued design snapshots and 18,480 completion entries. Long
escaped strings exercise serialization expansion. It passes the engine's full
state validator. Its reservation/history combinations represent **admission
bounds**, not a campaign claimed reachable through ordinary commands.

On Node 22, Linux x64, the single sequential observation
recorded:

| Observation | Result |
| --- | ---: |
| Compact state | 31,554,454 bytes |
| Compact envelope | 31,579,604 bytes |
| Encode and export admission | 79.58 ms |
| Decode and state-size admission | 141.95 ms |
| Clone, migrate and full validation | 81.91 ms |
| Largest sampled heap | 93,665,264 bytes |
| Largest sampled process RSS | 204,046,336 bytes |
| State SHA-256 after roundtrip | Exact match |

Raw environment, timings, phase memory samples and state hash are retained in
[`save-admission-node.json`](evidence/expansion/save-admission-node.json).
Memory was sampled at phase boundaries; it is not continuous peak memory or an
allocation count. This is one bounded Node observation, with no speedup or browser
responsiveness claim. Browser local-storage quotas may be lower than portable-file limits;
when autosave reports full storage, export a portable file.

## Executed browser roundtrip

Chrome 156 on the same Linux x64 workstation tested source
`381383e2c5a54c2e49c3516befb7942030607763`. The actual UI roundtrip preserved a
**2,429,209-byte** synthetic save, including every authoritative state field and
pack file. Switching to Machine Dawn before reimport ensured a rejected import
could not pass merely because the expected state was already active.

| Single observed transfer | Wall time |
| --- | ---: |
| Fixture file import | 326.06 ms |
| UI export, download and read | 67.68 ms |
| Reimport after changing campaign | 298.76 ms |

These samples include Playwright protocol and UI completion overhead. No turns
were simulated in this synthetic fixture, and the 31.58 MB Node stress fixture
was not loaded in the browser. The record therefore demonstrates the previous
two-million-byte regression is fixed, not worst-case browser responsiveness or
local-storage capacity.

The [final browser receipt](evidence/expansion/owner-20261112-verified/expansion/expansion-result.json)
contains the exact transfer observations. The exported file remains local;
its SHA-256 is `41b60eeec89714751416da81ff8f3b25b6d0f24b8155183d3063cc6332102b15`.
Recreate it with `createLargeSaveFixture()` from `tests/save-fixtures.mjs`;
[the evidence README](evidence/expansion/owner-20261112-verified/README.md)
provides a copyable command and the complete artifact inventory.
