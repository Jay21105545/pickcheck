# ADR 0016 — `tok/ai-ignore-coverage` retired as a scored rule, folded into the unscored token-surface report

**Status:** accepted · **Date:** 2026-09-03 · **Extends:** [ADR 0013](0013-unscored-token-surface-report.md)'s precedent to a second check

## Context

Corpus review (the same pass behind [ADR 0015](0015-manifest-tier-false-positive-fixes.md))
checked `tok/ai-ignore-coverage`'s firing rate across all 8 corpus repos
(`corpus/repos.json` — 4 controls, 4 AI-generated): it fired on **8/8**,
every single one, regardless of category. Investigating why: it checks
whether a present lockfile-type artifact is covered by one of six AI-tool
ignore-file conventions (`.cursorignore`, `.claudeignore`, `.aiderignore`,
`.codeiumignore`, `.windsurfignore`, `.rooignore`) — and **none of the 8
corpus repos has any of those files, nor any AI context file at all**
(no `CLAUDE.md`/`AGENTS.md`/`.cursorrules`/etc. anywhere in the sample).
The rule's underlying concern (AI coding tools index lockfiles/
`node_modules`/build output regardless of `.gitignore`) is real, but the
specific mitigation it checks for — a dedicated AI-ignore file — is a
niche, opt-in practice that this sample's controls and AI-generated repos
were equally unlikely to have adopted. A rule that fires identically on
every repo sampled, independent of quality, carries **zero discriminative
signal** as a *scored* finding: it can't separate a well-engineered
control from an AI-slop repo, which is the entire point of the composite
score.

This is exactly the failure mode ADR 0013 already named and rejected for
a *different* would-be tokens-category finding ("an always-on finding
permanently costs the `tokens` category a small fixed penalty on every
audited repo... directly contradicts [DECISIONS/0009]'s 'a category with
zero findings still reports 100'") — it just reproduced live, in a rule
that ships and scores today, rather than in the report ADR 0013 was
deciding not to build that way. At `severity: warn, weight: 2`, each
occurrence cost 20 penalty points (a repo with two matched lockfile-style
artifacts present, e.g. both `bun.lockb` and `package-lock.json`, cost 40)
— on the `tokens` category's `.10` composite weight, this alone kept every
sampled repo's `tokens` score below 100 and shaved a uniform few points off
every composite, controls and AI-slop alike.

## Options considered

1. **Add a precondition**: only apply the check when the repo already has
   an AI context file (proving active AI-tool adoption), mirroring
   DECISIONS/0005's conditional-`exists` pattern. Rejected: the underlying
   concern (wasted AI-tool context on indexed lockfiles) applies to anyone
   using Cursor/Claude Code/etc. day-to-day, whether or not they've written
   a formal `CLAUDE.md` — gating on context-file presence would trade one
   blind spot (fires on everyone) for a different one (misses the common
   case of ad-hoc AI-tool use with no context file), without actually
   restoring discriminative power, since 0/8 sampled repos have a context
   file either way.
2. **Reduce severity to `info` and/or reweight down.** Rejected as
   insufficient on its own: `SEVERITY_POINTS.info` is 4, not 0 —
   `scoreCategory`'s curve (DECISIONS/0009) still docks every repo a
   nonzero amount for a check with no ability to discriminate, just a
   smaller one. Softens the symptom, doesn't fix the "always fires, never
   informs the score" root cause.
3. **Move it out of scored findings entirely, into the unscored AI-context-
   surface report** (`engine/token-surface.ts`, ADR 0013's home for
   supplementary, non-penalizing stats). Adopted.

## Decision

Option 3. `computeTokenSurface()` gains a new `ignoreCoverage` field
(`IgnoreCoverageReport | undefined`), computed by a new
`computeIgnoreCoverage()` that runs the exact same check the retired rule
did — read `IGNORE_FILE_CANDIDATES` off disk, union into one `ignore()`
filter, test each present `IGNORE_COVERAGE_TARGETS` artifact against it —
just without turning the result into a `Finding`. Both constant lists are
now literal, tokens.ts-local values rather than rule-data fields, same
placement reasoning ADR 0013 already gave for `CONTEXT_FILE_GLOBS`: this
is a report, not a detection rule, so CLAUDE.md's "rules are data" doesn't
govern it, and coupling it to a rule id by deriving the list from
`rule.yaml` would be a worse coupling than accepting the two lists (this
one and the old rule's, now deleted) could in principle drift.

Unlike the context-file token count, ignore coverage is computed
**independent of whether any context file exists** — `computeTokenSurface`
no longer short-circuits to `report: undefined` just because
`CONTEXT_FILE_GLOBS` matched nothing; it now returns a (partial) report
whenever *either* a context file or a checkable artifact is present, since
the underlying question ("is this lockfile/build-output indexed by AI
tools without exclusion") doesn't depend on the repo having written a
formal context file at all — the same reasoning that ruled out option 1
above.

`tok/ai-ignore-coverage`'s `rule.yaml`/README/fixtures are deleted outright
(not parked in `_incubating/`, unlike DECISIONS/0014's
`ux/hardcoded-px-width`): `_incubating/` means "imprecise implementation,
resumable via a better tier" — this rule's *check* was accurate (the
artifact really is present, really isn't covered); the problem was scoring
it at all, which has nothing to recover via a future tier rewrite. The
`ignore-coverage` discriminant is removed from `TokensRule`'s
`pattern.check` union in `packages/rules/schema.ts` (schema.test.ts now
asserts it's rejected) and `runTokensTier`'s dispatch no longer has a case
for it — nothing can construct one anymore, scored or not.

## Consequences

- `packages/cli/src/render/terminal.ts`'s `renderTokenSurface` renders an
  "AI-ignore coverage: N artifact(s) not covered by …" line (only the
  uncovered artifacts, since covered ones need no action) whenever
  `ignoreCoverage` is defined and has at least one uncovered entry —
  independent of, and additional to, the existing "AI context surface: N
  tokens…" line, which is now itself only rendered when context files
  exist (previously the whole function short-circuited together).
- `packages/cli/src/render/json.ts` needed no change — `tokenSurface`
  already passes through `AuditResult` verbatim; `ignoreCoverage` just
  rides along as a new field in the existing JSON shape.
- Re-running the corpus: every sampled repo's `tokens` category score
  becomes 100 (nothing left in that category to score for 6 of 8 repos;
  `tok/context-file-budget`/`tok/context-duplication` remain scored rules,
  unaffected, and still fired zero times across this corpus per ADR 0014's
  own note that no sampled repo ships a context file). Composite
  movement: `saas-starter` 72.98 → 75.83 (clears the 75 control bar on
  this change alone), `taxonomy`/`commerce` gain a further ~2.9 points on
  top of ADR 0015's fix, `shelfly-creator-hub` (AI-generated) moves 77.94
  → ~82.4 — already above the control bar *before* this change, a
  pre-existing gap this ADR doesn't create and doesn't fix; flagged
  separately as needing its own investigation (likely a missing rule
  class, not a miscalibrated existing one).
- `tok/context-file-budget` and `tok/context-duplication` are unaffected
  and keep DECISIONS/0014's still-open flag: zero real-world validation,
  since no corpus repo ships a context file at all.
