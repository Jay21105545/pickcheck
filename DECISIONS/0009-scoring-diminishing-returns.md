# ADR 0009 — Category scoring: diminishing returns, not a hard floor

**Status:** accepted · **Date:** 2026-09-03 · **Supersedes:** [ADR 0006](0006-scoring-recalibration.md)'s category-aggregation step only (its additive-penalty philosophy, `PER_RULE_PENALTY_CAP`, composite renormalization, `CATEGORY_WEIGHTS`, and gating all carry forward unchanged)

## Context

Extending the ruleset from 6 rules to 10 (the astgrep and manifest tiers,
`qual/no-empty-catch`, `qual/fetch-has-error-handling`,
`sec/no-hallucinated-imports`, `sec/post-has-validation`) surfaced a real
calibration gap in ADR 0006's formula: `examples/broken-app` gained four
findings (six → ten) but its composite barely moved (32.5 → 31.88).
Investigating why (analysis only, no code changed, prior to this ADR):

- `categoryScore(category) = clamp(100 - Σ min(cap, rulePenalty), 0, 100)`
  is a **fixed 100-point budget** spent by summing capped-per-rule
  penalties. With this ruleset's actual weights (`sec/no-env-in-git` 5,
  `sec/no-secrets-in-code` 4, `sec/no-hallucinated-imports` 4 — all
  error-severity), a *single* finding from any one of them already
  exceeds `PER_RULE_PENALTY_CAP` (`25 × 4 = 100`, capped to 50) — so any
  **two** of them co-occurring sums to exactly 100, flooring the category
  at 0. That's not a rare edge case: "hardcoded secret + tracked `.env`"
  is the archetypal AI-slop combination CLAUDE.md itself names.
- Verified directly against the built CLI, not just the formula in
  isolation: a repo with 2, 3, and 4 distinct security-rule violations
  (secret → + hallucinated import → + unvalidated route) scored security
  `0, 0, 0` — completely flat across two additional, real, error-severity
  findings. `examples/broken-app`'s security category was already
  floored *before* this session's four new rules landed; they simply had
  nowhere left to register.
- The single-finding anchor (one hardcoded secret, otherwise-clean repo)
  scored security 50 and composite 59 (gated) — reasonable in isolation,
  but *indistinguishable in the composite* from the 2/3/4-violation
  repos above (58.75, 58.75, 55) once other categories' small movements
  are set aside. The score can tell "no security problem" from "a
  security problem," but nothing past that.

This is ADR 0006's own explicitly-stated design working exactly as
specified — "one rule can't zero a category alone, but two different
rules still can" — the problem is that the ruleset has grown to the
point where "two different rules" is trivially reached, and 0006 never
addressed what happens *after* that threshold. A fixed 100-point budget
subtracted linearly cannot satisfy both "a single serious finding should
visibly hurt" and "the category should keep discriminating as more
distinct violations accumulate" simultaneously — raising the per-rule cap
makes single findings hit harder but reaches the fixed budget with
*fewer* rules; lowering it delays saturation but weakens single-finding
severity. The two goals pull the same knob in opposite directions.

## Options

1. Retune `PER_RULE_PENALTY_CAP` and/or `SEVERITY_POINTS` to delay
   saturation. Rejected: as above, this is the same knob pulling two
   ways — it shifts *when* the floor hits, not *whether* one exists, and
   any retuning that meaningfully delays it also weakens the "one real
   error visibly wounds" anchor ADR 0006 established.
2. Replace the linear subtraction with a diminishing-returns curve at the
   category level, keeping `PER_RULE_PENALTY_CAP` exactly as-is (it still
   does real work: bounding what any single rule, however many times it
   fires, contributes to the sum fed into the curve).

## Decision

Option 2.

```
categoryPenalty(category) = Σ over rules r with ≥1 finding in category of
  min(PER_RULE_PENALTY_CAP, Σ over r's findings f of SEVERITY_POINTS[f.severity] × r.weight)
  # unchanged from ADR 0006

categoryScore(category) = 100 × CATEGORY_SCORE_K / (CATEGORY_SCORE_K + categoryPenalty(category))
  # was: clamp(100 - categoryPenalty(category), 0, 100)
```

`CATEGORY_SCORE_K = 50`, deliberately equal to `PER_RULE_PENALTY_CAP`
today but a distinct, independently-tunable constant — the two happening
to share a value isn't load-bearing. Choosing `K = PER_RULE_PENALTY_CAP`
means a single rule capped at its maximum (`categoryPenalty = K`) lands
the category at exactly `100 × K / (K + K) = 50` — **the identical anchor
value ADR 0006's linear formula produced for that same case**
(`100 - 50 = 50`). The single-finding anchor is unchanged by construction;
what changes is everything past it, since a hyperbola never reaches 0 for
finite input:

| distinct capped-error rules (security, this ruleset's real weights) | ADR 0006 (linear) | ADR 0009 (curve) |
|---|---|---|
| 1 | 50 | 50 |
| 2 | 0 | 33.33 |
| 3 | 0 | 25.00 |
| 4 (+1 uncapped warn) | 0 | 22.73 |

A category with many real problems now keeps getting visibly worse
instead of flatlining the moment two rules cross the old fixed budget.
`PER_RULE_PENALTY_CAP` still does its original job unmodified: one rule
firing 200 times (`disc/no-console-log`-style) still contributes at most
`K` to the sum, landing that category at 50 too — it still can't zero (or
even meaningfully approach 0) a category alone, same guarantee ADR 0006
made.

### Gate semantics reaffirmed, not changed

Investigating this also re-examined `SCORING_GATES`' `applyGates()`: it
was already `capped = Math.min(capped, gate.compositeCap)` — a
**ceiling**, not a flat override. A composite that's already below
`compositeCap` (because the repo is bad enough on its own, independent of
the gate) is left at its own value, never raised to meet the cap.
`instruction/ARCHITECTURE.md`'s Scoring section already documented this
correctly (`composite = min(composite, compositeCap)`); `scorer.ts`'s own
comment on `SCORING_GATES` was reworded here only for precision (it
previously said a gate "forces the composite down to `compositeCap`",
phrasing ambiguous enough to misread as an unconditional set). No
functional change to `applyGates()` was needed or made — this section
exists to state that plainly, since the investigation that led to this
ADR initially mischaracterized the gate as flat before rereading the
code. What *does* change in practice: with the new curve, a repo's
pre-gate composite is less likely to have already been driven to (or
below) the cap by category flooring alone, so the gate's ceiling
behavior — capping down a composite that would otherwise read as
"passing" — is now the thing actually doing the work, visibly, rather
than being redundant with an already-collapsed category score.

## Consequences

- `packages/cli/src/engine/scorer.ts` exports a new `CATEGORY_SCORE_K`
  alongside `PER_RULE_PENALTY_CAP`, `CATEGORY_WEIGHTS`, and
  `SCORING_GATES`. `scoreCategory()`'s only change is the final
  expression; penalty accumulation, the per-rule cap, composite
  renormalization, and gating are untouched.
- `examples/broken-app` (now ten rules, ten findings) composite moves
  from **31.88** (the pre-0009 number, itself barely changed from the
  six-rule 32.5) to a meaningfully different value reflecting that it's
  genuinely a worse repo now — security no longer reads as an
  indistinguishable 0. Still gated below the default `--min 60`.
- `packages/cli/test/engine/scorer.test.ts` updated throughout: every
  test whose expected value depended on the old linear formula now uses
  a `curve()` helper mirroring `scoreCategory`'s math exactly, so the
  test file itself can't drift from the implementation the way hardcoded
  literals did across this revision. New tests pin the single-secret
  anchor (security 50, composite 59, matching the real ruleset), the
  2/3/4-distinct-violation monotonic-decrease regression, the 200×
  single-rule case still not zeroing a category, and the gate's ceiling
  (not flat-value) behavior explicitly.
- `instruction/ARCHITECTURE.md`'s Scoring section is rewritten to match
  this formula exactly, same treatment ADR 0006 gave ADR 0004's section.
- A future rule with a very low weight (e.g. 1) in a category that
  otherwise has no findings now scores closer to, but still meaningfully
  below, 100 for a single occurrence (`curve(10) ≈ 83.33` for a
  weight-1 warn, vs. `90` under ADR 0006) — the curve is slightly
  harsher than linear subtraction near the origin. This is an accepted
  side effect of choosing `K` to preserve the *high-severity* anchor
  (`K = PER_RULE_PENALTY_CAP`) rather than the low-severity one; revisit
  `K` independently via a future decision record if small-repo fairness
  at the low end turns out to matter more than the high-end floor this
  ADR fixes.
