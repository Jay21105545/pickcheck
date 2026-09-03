# ADR 0008 — Whole-file suppression for the regex tier via `pattern.unless`

**Status:** accepted · **Date:** 2026-09-03

## Context
RULESET.md's `sec/post-has-validation` needs to flag `req.body` /
`await request.json()` reads in a route handler **unless** the same file
also references a validation library (`zod`, `yup`, `joi`, `valibot`,
`class-validator`). The regex tier as it existed (ADR 0004) tests one
pattern per line, independently — it has no way to make a line's finding
conditional on a *second* pattern's absence anywhere else in the same
file. Two shapes were considered for this, the same choice ADR 0005 faced
for the exists tier's conditional-presence gap:

## Options
1. Special-case `sec/post-has-validation` in the regex tier.
2. A new tier for "line pattern gated by a whole-file negative pattern."
3. Extend the regex tier's schema with an optional `pattern.unless: {
   regex, flags? }`: if it matches anywhere in a matched file's content,
   that file produces zero findings for the rule, full stop.

## Decision
Option 3, directly mirroring ADR 0005's `pattern.when` for the exists
tier: an optional, generic field any regex rule can opt into, not a
rule-specific special case. Unset (every regex rule before this field
existed) is byte-for-byte the old behavior. `runRegexTier()` tests
`unless` against the whole file's content once, before the per-line loop,
and skips the file entirely if it matches — resetting `lastIndex` first,
same reason the per-line loop already does: a stateful global/sticky
`unless` pattern reused across files would otherwise silently skip
matches on files after the first (see ADR 0004's fix for the same class
of bug on the primary pattern).

Option 1 rejected per CLAUDE.md's "the engine never contains rule-specific
code." Option 2 rejected as overkill — the entire delta from a plain regex
rule is "also test a second pattern against the whole file first," which
doesn't warrant a parallel tier with its own dispatch branch and schema;
`pattern.unless` is a small, reusable capability the regex tier already
has almost all the machinery for (reading file content, compiling a
RegExp from rule data).

## Consequences
- `regexRuleSchema.pattern` gains an optional `unless`; `sec/post-has-
  validation` is the first (not the only future) consumer.
- This is a whole-*file* suppression, not a whole-*rule* applicability
  gate like `pattern.when` — `scorer.ts`'s `isApplicable()` needed no
  change, since a regex rule's applicability is already "did `files`
  match anything," unaffected by what `unless` later suppresses per file.
- Known limit, stated honestly in `sec/post-has-validation`'s README: this
  proves a validation *library* is referenced somewhere in the file, not
  that it's actually applied to the specific `req.body` read being
  flagged, nor does it see validation performed in a different file
  (shared middleware, a separate schema module). RULESET.md stages this
  rule as "regex v1 → astgrep v1.1" for exactly this reason.
