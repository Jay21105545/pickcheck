# ADR 0006 — Scoring recalibration: additive penalties, gating, ignore

**Status:** accepted · **Date:** 2026-09-02 · **Supersedes:** [ADR 0004](0004-scoring-normalization.md)'s formula (category weights are kept)

## Context

`examples/broken-app` — a repo with a tracked `.env`, a hardcoded Stripe
key, no CHANGELOG/API.md/.env.example, and a stray `console.log` —
scored **96.85/100 composite and exited 0** under ADR 0004's formula.
That's a failed design: a repo with hardcoded secrets and a tracked
`.env` file must never read as "passing" to a human skimming the score,
and it must fail the CLI's own default gate (`--min 60`).

Two things drove the old score that high:

1. **Division by applicable-rule count.** `100 − Σ(weight × multiplier) /
   applicableCount` shrinks every finding's impact as more rules join a
   category — 2 severe security findings landed as `100 − 18/2 = 91`.
2. **Weak severity multipliers** (info 0.5, warn 1, error 2) that, even
   undivided, don't separate "someone should fix this" from "this is
   dangerous."

Recalibrating also surfaced two bugs, fixed in the same pass because the
anchor numbers below can't be verified without them:

- **`micromatch.some()` is not negation-aware.** It tests each pattern in
  a `patterns` array as its own independent standalone matcher and ORs
  the results, instead of computing the positively-matched set and then
  subtracting negated patterns the way `micromatch()`'s plain filter
  does. A file "matches" `!**/fixtures/**` in isolation simply by not
  being under `fixtures/` — so the moment a rule's `files` or
  `pattern.when.files` included a `!`-exclusion (`sec/no-env-in-git`,
  `docs/api-doc-exists`, `docs/env-example-exists` all do, per
  DECISIONS/0005), every `.some()`-based applicability/precondition check
  returned `true` almost unconditionally, independent of whether the
  positive patterns matched anything. This silently broke
  `docs/api-doc-exists` and `docs/env-example-exists`'s `pattern.when`
  gate (built in ADR 0005) the moment their `when.files` gained a
  fixtures exclusion, and skewed every applicability check used by this
  ADR's composite renormalization below. Root-caused against
  `node_modules/micromatch/index.js`'s actual `.some()` implementation,
  not guessed. Fixed by adding `packages/cli/src/engine/glob.ts`'s
  `matchesAnyGlob()` — `micromatch(list, patterns, {dot:true}).length >
  0` — and routing every `.some()`-shaped applicability/precondition
  check in `scorer.ts` and `tiers/exists.ts` through it instead.
- **`examples/broken-app` polluting pickcheck's own self-audit.** Solved
  separately — see "Ignoring examples/ in self-audits" below — not a
  scoring-formula problem, but discovered while validating this ADR's
  85+ self-audit anchor.

## Options considered for the formula

1. Keep dividing by applicable count, just raise the multipliers. Rejected: division is the mechanism that "dilutes findings as the ruleset grows and silently inflates scores across versions" (this ADR's own mandate) — raising multipliers only delays the same failure to a later ruleset size.
2. Additive point penalties per finding (severity points × rule weight), no division, floor 0. Adopted.
3. A hard per-category cap plus additive penalties, no per-rule cap. Rejected: a single rule re-matching hundreds of times (e.g. `disc/no-console-log` across a large repo) could zero a category by itself, which is disproportionate for one issue type — requirement to cap per-rule contribution instead.

## Decision

### Additive, capped, per-category penalty

```
SEVERITY_POINTS = { info: 4, warn: 10, error: 25 }
PER_RULE_PENALTY_CAP = 50

categoryPenalty(category) =
  Σ over rules r with ≥1 finding in category of
    min(PER_RULE_PENALTY_CAP, Σ over r's findings f of SEVERITY_POINTS[f.severity] × r.weight)

categoryScore(category) = clamp(100 − categoryPenalty(category), 0, 100)
```

No division anywhere. A category with rules loaded but zero findings, or
zero rules loaded at all, still *reports* 100 (nothing wrong, or nothing
checked) — but see composite renormalization below for what that 100
does and doesn't contribute to the composite.

With this ruleset's actual weights (`sec/no-env-in-git` 5,
`sec/no-secrets-in-code` 4), a single error-severity finding already
exceeds `PER_RULE_PENALTY_CAP` on its own — `25 × 4 = 100`, capped to 50
— so one error takes a category to exactly half (**visibly wounds**),
and a second error from a *different* rule stacks a second capped
penalty on top, usually to 0 (**devastates**). That gradient is a direct
consequence of the constants, not asserted separately.

### Per-rule penalty cap

`PER_RULE_PENALTY_CAP = 50` bounds what any single rule can contribute
to its category's penalty, regardless of how many times it fires. 200
`console.log` findings from one rule cost the same capped 50 as one —
enough to hurt, never enough alone to zero a category. Combined with a
*second* rule's findings, a category can still reach 0; the cap is
per-rule, not per-category.

### Composite: renormalize over categories with an applicable rule

```
composite = Σ (categoryScore × CATEGORY_WEIGHTS[category]) over categories
              with ≥1 applicable rule for this scan
            ────────────────────────────────────────────────────────────
            Σ CATEGORY_WEIGHTS[category] over the same categories

composite = 100 if no category has any applicable rule at all
```

`CATEGORY_WEIGHTS` itself is unchanged from ADR 0004 (security .30,
quality .20, docs .15, discipline .15, ui-ux .10, tokens .10) — this ADR
keeps the ratios, per the recalibration's own scope, but changes what
they're computed *over*. Without renormalizing, `ui-ux` and `tokens` —
which have zero rules today (Phase 3 per EXECUTION.md) — contribute a
free 100 at full nominal weight (.10 + .10 = 20 composite points,
unconditionally), which both inflates today's composite relative to the
day rules land there (the exact "silently inflates scores across
versions" failure mode named for the per-category division, just at the
composite level instead) and is structurally why `examples/broken-app`
couldn't reach below ~40 composite under any severity tuning while empty
categories stayed weighted at full value — three of six categories
(`quality`, `ui-ux`, `tokens`) would guarantee 40 points no matter how
devastating `security`/`docs`/`discipline` got. "Applicable" reuses ADR
0004/0005's existing definition (exists-tier unconditional → always;
exists-tier conditional → precondition matched; regex/astgrep/tokens →
`files` glob matched something), just repurposed from a divisor into an
inclusion filter.

A category's own reported score is unaffected by renormalization — it's
still shown at its computed value (100 if unchecked) in the per-category
breakdown. Renormalization only changes what feeds the single composite
number.

### Gating severity (general mechanism)

```ts
interface ScoringGate {
  category: Category;
  minSeverity: Severity;
  compositeCap: number;
}
```

`scoreFindings(findings, rules, scannedFiles, gates = SCORING_GATES)`
applies each gate after computing the renormalized composite: if any
finding is in `gate.category` at `gate.minSeverity` or worse, `composite
= min(composite, gate.compositeCap)`. The check has no category-specific
code — it reads `gates` generically and matches on data. Today's only
entry:

```ts
export const SCORING_GATES: ScoringGate[] = [
  { category: "security", minSeverity: "error", compositeCap: 59 },
];
```

59 sits one point under the CLI's default `--min 60`, so any
error-severity security finding fails the default gate regardless of
how clean the rest of the repo is — leaked secrets and tracked `.env`
files can never coexist with a passing default audit. `gates` is an
optional parameter (defaulting to `SCORING_GATES`) specifically so this
is testable and swappable — `packages/cli/test/engine/scorer.test.ts`
proves the mechanism is generic by pointing a custom gate at `docs`
instead of `security` and confirming it caps the composite identically.

### Ignoring examples/ in self-audits

`examples/broken-app` is permanently, deliberately bad — it exists to
prove the rules and scorer work, not as real content pickcheck's own
score should be judged against. `.gitignore` is the wrong tool (it's
legitimately git-tracked; the demo has to actually exist in the repo).
`scanRepo()` (`packages/cli/src/engine/scan.ts`) now additionally reads
an optional `.pickcheckignore` at the scanned root, same gitignore
pattern syntax, merged into the same `ignore()` filter as `.gitignore`;
`.pickcheckignore` itself joins `.gitignore` as always-force-ignored
plumbing (not audited content). This repo's own root `.pickcheckignore`
contains one line, `examples/`. This is a general mechanism — any user
can exclude their own demo/example directories from their own audits the
same way — not something special-cased to the string "examples" in
engine code.

## Consequences

- `examples/broken-app` now scores **32.5 composite and exits 1** at the
  default `--min 60` (verified against the actual built CLI, not just
  the formula in isolation) — within the 30-55 anchor range, correctly
  gated.
- pickcheck's own repo, scanned with `.pickcheckignore` excluding
  `examples/`, has zero findings and scores **100** (well above the 85+
  anchor) — see `packages/cli/test/engine/scorer.test.ts`'s "clean
  baselines" describe block, which doubles as this anchor's test.
- `instruction/ARCHITECTURE.md`'s Scoring section is rewritten to match
  this formula exactly, replacing ADR 0004's normalized-division
  description.
- `packages/cli/src/engine/scorer.ts` exports `PER_RULE_PENALTY_CAP` and
  `SCORING_GATES`/`ScoringGate` alongside the existing
  `CATEGORY_WEIGHTS`, so rule/config authors and tests can reference the
  live constants instead of copying numbers.
- A future `pickcheck.config.ts` (ARCHITECTURE.md's Extension Points)
  overriding gates or the per-rule cap is a config change, not an engine
  change — `scoreFindings()`'s `gates` parameter already supports it.
- Small, mostly-clean repos are scored harshly relative to ADR 0004 by
  design (this ADR's mandate: "small-repo fairness matters less than
  honesty, when in doubt harsher") — a single stray `console.log` alone
  only costs 10 points in its category, but two unrelated error-severity
  findings in one category can zero it, and any security error caps the
  whole composite at 59 no matter what else is true about the repo.
