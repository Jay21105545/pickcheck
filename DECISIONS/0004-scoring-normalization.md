# ADR 0004 — Scoring normalization: what "applicable" means

**Status:** accepted · **Date:** 2026-09-02

## Context
ARCHITECTURE.md's Scoring section said category score is "100 −
Σ(finding weight × severity multiplier), floor 0 ... normalized by
rules-applicable count so small repos aren't over-punished" but never
defined "applicable." Implementing `scoreFindings()` (`packages/cli/src/
engine/scorer.ts`) required picking an exact denominator, since the two
obvious readings diverge:

- Count every loaded rule in the category (regardless of whether its
  `files` glob matches anything in this repo).
- Count only rules that were actually meaningful for this repo.

The difference matters concretely: an `exists`-tier rule's job is to
notice a file that ISN'T there (e.g. `docs/changelog-exists` wants
CHANGELOG.md present). If "applicable" required a files-glob match, that
rule would only count as applicable in the one case where it can never
fire — the exact repos it should be flagging (CHANGELOG.md missing) would
make it count as zero applicable rules for `docs`, which — combined with
"zero applicable rules scores 100" — would hide the very violation the
rule exists to catch.

## Options
1. Applicable = every loaded rule in the category, unconditionally
   (denominator is just rule count per category).
2. Applicable = rule's `files` glob matched ≥1 scanned file, for every
   tier including `exists`.
3. Applicable = tier-dependent: `exists`-tier rules are always applicable
   (absence of a match is the finding, so applicability can't be gated on
   a match existing); `regex`/`astgrep`/`tokens`-tier rules are applicable
   only if their `files` glob matched ≥1 scanned file (no point diluting
   the average with a rule that had nothing to check in this repo).

## Decision
Option 3, implemented in `scoreCategory()`:

```
applicableCount(category) =
  count of rules where rule.category === category AND (
    rule.tier === "exists"
    OR micromatch.some(scannedFiles, rule.files)
  )

if applicableCount(category) === 0:
  categoryScore = 100   // nothing checked, nothing docked

else:
  penalty = Σ over findings f in this category of
              (rule(f).weight × severityMultiplier[f.severity])
  categoryScore = clamp(100 − penalty / applicableCount(category), 0, 100)

severityMultiplier = { info: 0.5, warn: 1, error: 2 }

composite = Σ over categories of (categoryScore × CATEGORY_WEIGHTS[category])
CATEGORY_WEIGHTS = { security: .30, quality: .20, docs: .15,
                      discipline: .15, "ui-ux": .10, tokens: .10 }
```

Option 1 was rejected: it lets rules whose `files` glob matches nothing
in this repo (e.g. a Python-only rule in a pure-TS repo) still dilute the
average, quietly inflating scores toward 100 as unrelated rules
accumulate in a category. Option 2 was rejected for the CHANGELOG reason
above — it inverts `exists`-tier rules' entire purpose.

## Consequences
- A category with zero applicable rules scores 100, not 0 — an
  unaudited category reads as "nothing to report," not "failing."
  Composite is therefore 100 with no rules loaded at all (the current
  state — see Phase 0/this task's "no rules yet" scope).
- Adding an `exists`-tier rule to a category always changes that
  category's applicable count by exactly 1, regardless of repo contents.
- `packages/cli/test/engine/scorer.test.ts` pins this: an `exists`-tier
  rule stays applicable with zero scanned files (proving the branch isn't
  silently defaulting to the "zero applicable" 100 case), and a
  non-matching regex-tier rule added alongside an applicable one doesn't
  change the applicable count or the resulting score.
- instruction/ARCHITECTURE.md's Scoring section is updated alongside this
  record to state the formula and the applicability rule exactly, instead
  of leaving "normalized by rules-applicable count" undefined.
