---
"pickcheck": patch
---

Rewrite the README as the project's front door, and correct the npm package
metadata.

The README now leads with what pickcheck is for — AI writes the happy path
and skips the sad path; this is the inspection that catches what it skipped
— and carries the full 13-repo corpus table with its `stack` and
`provenance` columns, the published precision history (36% → 90% after
calibration; `sec/no-hallucinated-imports` 1.3% → 56.4% after the `extends`
fix; `ux/hardcoded-px-width` pulled at 18% rather than shipped noisy), and
the honest limits from DECISIONS/0029 — that the original corpus confounded
stack with provenance, and that two candidate rules were dropped for
tracking the framework rather than the generator.

The published `description` omitted the `quality` category, listing five of
the six scored axes; it now lists all six. Keywords are aligned with the
repository's topics for discoverability. No rule or engine behaviour
changed.
