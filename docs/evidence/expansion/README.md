# Expansion evidence publication

The final [owner verification](owner-20261112-verified/README.md) passed all
14 expansion checks and both 18-check legacy suites. The earlier
[12/13 result](owner-20261112/README.md) preserves the failed backdrop candidate
and its diagnostic findings.

Public JSON receipts are **sanitized excerpts**, not byte-identical raw outputs.
They retain test outcomes, workload measurements, source hashes and a coarse
environment (Linux x64, Node 22, Chrome 156 and an NVIDIA/ANGLE rendering path).
Absolute workstation/temp paths, browser command lines, process identifiers,
exact hardware models, driver identifiers and detailed GPU capability dumps have
been removed or replaced by targeted summaries. Guided-command excerpts may
also contain repository-relative paths or placeholders.

Original recordings and detailed environment information remain unchanged in
local storage. [public-evidence-index.json](public-evidence-index.json) records
the SHA-256 of each original excerpt and its public counterpart. Owner artifact
inventories retain **original local** byte counts and hashes; `retainedHere`
means a public artifact or sanitized excerpt exists, not that its bytes match
the original. Raw trace hashes identify the local recordings used to derive
published event counts, without exposing process IDs.

Typed content artifacts (`stress-pack.json` and creator native/SDK/Workbench
exports) and screenshots retain their original bytes. Public metadata cleanup
does not change game source, tests, test outcomes or benchmark measurements,
and does not constitute another browser run. Source checkpoint hashes refer to
the locally tested versions; they are not claims about review-branch ancestry.
