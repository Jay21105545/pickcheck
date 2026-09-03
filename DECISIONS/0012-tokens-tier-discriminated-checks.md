# ADR 0012 — Tokens tier implemented as three `pattern.check` modes; gpt-tokenizer added

**Status:** accepted · **Date:** 2026-09-03

## Context
`tiers/tokens.ts` shipped as a stub (ADR from Phase 1 scaffolding):
always zero findings, a "not implemented yet" warning, `pattern: {
budget: number }`. Phase 3 (EXECUTION.md, IDEA.md's "Tokens" category)
needs three genuinely different checks over a repo's AI-context surface:

1. **Budget** — a single context file (CLAUDE.md, AGENTS.md, …) exceeding
   a token count. Needs a tokenizer.
2. **Duplication** — the same content repeated verbatim across two or
   more context files. Needs comparing multiple files' content against
   each other, not one file in isolation.
3. **AI-ignore coverage** — a heavy/generated artifact (a lockfile,
   `node_modules`, a build dir) present on disk but not excluded from AI
   assistant context via `.cursorignore`/`.claudeignore`/equivalent. Needs
   reading ignore-file *content* and checking it against artifacts that
   are normally *outside* the gitignore-filtered file list this engine
   already works from — a fundamentally different shape of check than
   "does this file's content match a pattern."

None of these three share a pattern shape, but all three are about the
same thing (IDEA.md: "Tokens — AI context surface measured locally"), and
none needs its own dispatch branch's worth of difference from the others
at the tier level — the engine-level need in each case is just "read some
files, do a bit of file-content or filesystem-existence logic, emit
findings," the same shape every other tier already has.

## Options
1. Three separate tiers (`tokens`, `token-duplication`,
   `ignore-coverage`), each with its own schema branch and dispatch case.
2. One `tokens` tier, `pattern` discriminated by a `check` field
   (`"budget" | "duplicate" | "ignore-coverage"`), each with its own
   pattern shape — the same "discriminate the payload, not the tier" move
   the `exists` tier's `pattern.mode` and the `regex` tier's
   `pattern.unless`/`pattern.minCount` already make.
3. Keep one flat `tokens` pattern shape and shoehorn duplication/ignore-
   coverage into `budget`-shaped fields.

## Decision
Option 2. `tokensRuleSchema.pattern` is now `z.discriminatedUnion("check",
[budget, duplicate, ignoreCoverage])`; `runTokensTier()` switches on
`rule.pattern.check` and delegates to one function per check. This is a
breaking schema change from the Phase-1 stub's flat `{ budget }` shape
(no rule ever shipped with the old shape — the stub never produced a
finding — so there's no migration to preserve); every `tokens`-tier
`rule.yaml` must now set `pattern.check` explicitly.

`gpt-tokenizer` (EXECUTION.md's stack table) is added as a real
dependency and lazy-loaded via a dynamic `import()` inside
`runBudgetCheck()` only — never at module scope — same cold-start
discipline `tiers/astgrep.ts` already applies to `@ast-grep/napi`; the
`duplicate` and `ignore-coverage` checks never touch it, so a repo with
no oversized context file pays nothing for the tokenizer at all.

**Per-check applicability, and why `ignore-coverage`'s `files` isn't the
artifacts it checks:** ARCHITECTURE.md's scoring makes a non-`exists`-tier
rule "applicable" (counted in a category's composite contribution) only
if `rule.files` matches at least one scanned (gitignore-filtered) file.
For `budget` and `duplicate`, `files` is naturally the context-file globs
being checked — unremarkable. For `ignore-coverage`, the artifacts that
matter most (`node_modules`, `dist`, a build dir) are normally *excluded*
from `ctx.scannedFiles` by `.gitignore` — that's precisely the situation
the rule exists to double-check isn't the *only* thing keeping them out
of AI context. Setting `files` to those artifact globs would make the
rule inapplicable (contributing neither credit nor penalty) on exactly
the repos most likely to have the problem: a totally fresh clone with no
AI-ignore file and a git-ignored `node_modules` sitting right there.
Instead, `rule.files` holds tracked lockfile names (`package-lock.json`,
`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) — reliably git-visible in any
dependency-heavy JS/TS repo, so `scannedFiles` sees them regardless of
gitignore, making this rule "applicable" exactly when it's the kind of
repo the check makes sense for. The candidate ignore files actually read
(`pattern.ignoreFiles`) and the artifacts actually checked
(`pattern.requiredPatterns`) are separate fields, read directly off disk
via `readFile`/`stat` inside `runIgnoreCoverageCheck()` — independent of
`ctx.scannedFiles` entirely, so a gitignored `node_modules` is still
seen. Each `requiredPatterns` entry only produces a finding if it
actually exists on disk (`stat` succeeds) — a fresh clone before install
has nothing to flag yet.

Option 1 rejected as the literal thing ADR 0008 already argued against
for a smaller case: three parallel tiers multiply schema, dispatch, and
docs for checks that share every mechanical concern except pattern shape.
Option 3 rejected — forcing duplication/ignore-coverage through a
budget-shaped `{ budget: number }` pattern would mean inventing meaning
for a field name that doesn't fit either check, which is worse than an
honest discriminated union.

## Consequences
- `packages/cli/package.json` gains `gpt-tokenizer` as a real dependency
  (previously listed only in EXECUTION.md's stack table, never installed).
- `tok/context-file-budget`, `tok/context-duplication`, and
  `tok/ai-ignore-coverage` are the three Phase-3 consumers; any future
  tokens-category rule adds a fourth `check` variant rather than a new
  tier.
- Cross-file duplicate-paragraph matching (`extractParagraphs`/
  `findDuplicateParagraphs`) lives in `engine/text-duplication.ts`, not
  inlined into `tiers/tokens.ts`, because the unscored AI-context-surface
  report (ADR 0013) needs the identical logic for its waste-% estimate —
  one implementation, not two that could drift apart.
- Known limit, stated honestly in `tok/ai-ignore-coverage`'s README:
  `requiredPatterns`/lockfile checks are repo-root-only (no recursive
  monorepo-package `node_modules`/`dist` detection) — matching this
  rule's own `files` precondition being root-lockfile-based, and staying
  cheap (no filesystem walk beyond a handful of `stat` calls).
