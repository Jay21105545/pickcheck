# ADR 0005 — Conditional exists-tier rules via `pattern.when`; scanning dotfiles

**Status:** accepted · **Date:** 2026-09-02

## Context
Implementing RULESET.md's first rule batch surfaced two gaps in the exists
tier as ADR 0004 left it:

1. `sec/no-env-in-git` needs to notice `.env`/`.env.local`/`.env.production`.
   `scanRepo()` called `fast-glob` with `dot: false` (fast-glob's default),
   which makes `**/*` never match a dotfile regardless of `.gitignore`. No
   exists-tier rule targeting a dotfile could ever produce a finding —
   confirmed by hand: a temp dir with `.env` on disk scanned to `[]`.
2. `docs/api-doc-exists` and `docs/env-example-exists` are specced as
   *conditional*: "applies only if an API surface is detected" /
   "applies only if code references `process.env.X`". The exists tier only
   has "does `files` match anything" — no way to gate that check on a
   *different* glob (the API-surface markers, or an on-disk `.env`) having
   matched first. Shipping them unconditionally would flag every repo
   without an API for a missing API.md — including pickcheck's own repo,
   which has no API surface. That's a false positive, not a finding
   (EXECUTION.md's "control-repo alarm"), and undermines "we pass our own
   audit" honestly rather than by relaxing a rule.

## Options (for the conditional-exists gap)
1. Special-case these two rule ids in the engine.
2. Add a new tier (e.g. `exists-conditional`) just for this shape.
3. Add an optional `pattern.when: { files: string[] }` to the existing
   `exists` tier's schema: the rule only runs if `when.files` matches ≥1
   scanned file. Generic, reusable by any future exists rule, not tied to
   a rule id.

## Decision
- **Dotfiles:** `scanRepo()` now passes `dot: true` to fast-glob. To avoid
  regressing the existing "honors .gitignore" behavior for the one dotfile
  that's pure repo plumbing, `.gitignore` itself joins `.git/` and
  `node_modules/` in `ALWAYS_IGNORED` (a literal segment match, unaffected
  by the `dot` option either way). Every other dotfile — `.env`,
  `.env.example`, etc. — is now visible to every tier.
- **Conditional exists:** Option 3. `existsRuleSchema.pattern.when` is
  optional; when absent, behavior is byte-for-byte what it was before this
  record (ADR 0004's "always applicable"). When present, `runExistsTier()`
  short-circuits to no findings if `when.files` doesn't match, and
  `scoreCategory()`'s `isApplicable()` excludes the rule from the
  denominator in that case too — the same treatment ADR 0004 already gives
  regex/astgrep/tokens rules whose `files` glob matches nothing.
  `docs/api-doc-exists` gates on API-surface paths (`app/api/**`,
  `pages/api/**`, `routes/**`, …); `docs/env-example-exists` gates on an
  on-disk `.env*` existing (a glob-based proxy for "this app reads
  environment variables" — cheaper than parsing `process.env.X` references
  out of source, and reuses `sec/no-env-in-git`'s own glob).

Option 1 was rejected outright — CLAUDE.md: "the engine never contains
rule-specific code." Option 2 was rejected as overkill: the entire
difference from an unconditional exists rule is "check a second glob
first," which doesn't warrant a parallel tier with its own dispatch branch,
schema, and docs.

Running the built CLI against pickcheck's own repo (see Definition of Done)
surfaced a second, related dotfile gap: `micromatch`, like fast-glob,
defaults to `dot: false`. A `files`/`when.files` exclusion pattern like
`!**/fixtures/**` — needed so `sec/no-env-in-git` and
`docs/env-example-exists` don't flag this repo's own rule-fixture `.env`
files as if they were real leaks — silently failed to exclude them,
because the trailing `**` in `**/fixtures/**` won't match a `.env`
segment without `dot: true`, even though `scanRepo()` now puts `.env` in
the list being filtered. Every `micromatch(...)` / `micromatch.some(...)`
call site in the engine (`tiers/regex.ts`, `tiers/exists.ts`,
`scorer.ts`'s `isApplicable`) now passes `{ dot: true }`, for the same
reason `scanRepo()` does: once dotfiles are visible to a `scannedFiles`
list, every downstream glob match against that list needs to treat them
as ordinary path segments, or exclusion patterns silently no-op on them.

## Consequences
- `pattern.when` is available to any future exists-tier rule, not just
  these two.
- `docs/env-example-exists` ships as a binary presence check only —
  RULESET.md's "coverage %, threshold 60%" (do the *specific* keys code
  references appear in `.env.example`) is NOT implemented; that needs
  content parsing of `process.env.X` references, which is a bigger, more
  rule-specific capability than a files-glob precondition can express
  honestly. Deferred, and said so in that rule's README, mirroring how
  RULESET.md itself stages `sec/post-has-validation` as "regex v1 → astgrep
  v1.1".
- `disc/no-console-log` is specced in RULESET.md as `astgrep` tier, but the
  astgrep tier is still an unimplemented stub (`tiers/astgrep.ts`) — it can
  only ever return zero findings right now. Rather than ship a rule that
  can structurally never trigger, it's implemented as `regex` tier this
  round (`console\.log\(` on non-test/non-config source paths), with the
  spec's intended astgrep-tier upgrade noted in its README as future work,
  same staging pattern as the point above.
- `packages/rules/package.json` gained a `"./package.json": "./package.json"`
  self-export so `@pickcheck/cli` can resolve the installed rules
  directory at runtime via `require.resolve("@pickcheck/rules/package.json")`
  → `dirname(...)`, without hardcoding a relative path from its own bundled
  output (which would break depending on how deeply tsup nests `dist/`).
