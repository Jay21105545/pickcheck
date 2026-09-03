# ADR 0011 — Per-file occurrence threshold for the regex tier via `pattern.minCount`

**Status:** accepted · **Date:** 2026-09-03

## Context
Phase 3's `ui-ux/inline-hex-threshold` rule (RULESET.md's Phase-3 scope,
IDEA.md's "inline hex colors above a per-file threshold") needs to flag a
file only once it repeats a pattern *many* times — a stray `#fff` in one
component is normal CSS; forty inline hex literals in one file is the
actual design-token-drift signal. The regex tier as ADR 0004/0008 left it
tests one pattern independently per line and produces one finding per
matching line — it has no notion of "how many times across the whole
file," so a threshold-based rule couldn't be expressed without either
flooding a finding per occurrence (defeating the point — the *count* is
the signal, not any individual line) or new engine capability.

## Options
1. Special-case `ui-ux/inline-hex-threshold` in the regex tier.
2. A new tier for "count occurrences file-wide, gate on a threshold."
3. Extend the regex tier's schema with an optional `pattern.minCount:
   number`: when set, count every occurrence of `regex` across the whole
   file (not per matching line), and produce a single finding — anchored
   at the threshold-crossing occurrence's line — once that count reaches
   `minCount`. Below the threshold, the file is silently fine.

## Decision
Option 3, the same move ADR 0005 (`exists` tier's `pattern.when`) and ADR
0008 (`regex` tier's `pattern.unless`) already made: an optional, generic
field any regex rule can opt into, not a rule-specific special case.
Unset (every regex rule before this field existed) is byte-for-byte the
old per-line behavior — `runRegexTier()` only takes the new branch when
`minCount` is present, and it's checked after `unless` (a file `unless`
already suppressed skips the count entirely, same short-circuit order the
old per-line loop used relative to `unless`).

Counting happens with a fresh `RegExp` compiled with a forced `g` flag
against the file's full content via `matchAll` — the same
"force-add-`g`-if-missing" move `tiers/manifest.ts` already makes for its
own whole-content `matchAll` scan, not a new pattern. The reported
finding's line is the threshold-crossing occurrence's (the `minCount`-th
match, 1-indexed into the content), not the first or last, so the
location a user is sent to is the point past which the file actually
became a problem. `findings.ts`'s `buildFixPrompt()` gained an optional
`context` parameter (a string appended parenthetically to the rendered
prompt) so the finding can honestly report `"N occurrences, threshold M"`
— a computed fact from the tier, not a new hardcoded prose string, so it
doesn't run against CLAUDE.md's "every user-facing string lives in the
renderer layer" (the message text itself is still exactly `rule.message`,
unmodified).

Option 1 rejected per CLAUDE.md's "the engine never contains rule-specific
code." Option 2 rejected as overkill — the entire delta from a plain regex
rule is "count instead of test, once, across the whole file," which
doesn't warrant a parallel tier; the regex tier already has all the
machinery (compiling a `RegExp` from rule data, reading file content).

## Consequences
- `regexRuleSchema.pattern` gains an optional `minCount`;
  `ui-ux/inline-hex-threshold` is the first (not the only future)
  consumer — any future "too many X in one file" rule can reuse it
  without engine changes.
- A `minCount` rule produces **at most one finding per file**, regardless
  of how far over the threshold it is — consistent with
  `PER_RULE_PENALTY_CAP` already flattening "many findings from one rule"
  into a bounded penalty, and keeps a genuinely bad file from flooding the
  terminal report with one line per hex color.
- `scorer.ts`'s `isApplicable()` needed no change — a regex rule's
  applicability is still "did `files` match anything," unaffected by
  whether `minCount` later suppresses a specific file's finding.
- Known limit, stated honestly in `ui-ux/inline-hex-threshold`'s README:
  the threshold is a single fixed number in the rule's own `rule.yaml`,
  not configurable per-repo yet (no `pickcheck.config.ts` exists — see
  ARCHITECTURE.md's "Extension Points, design now, build later").
