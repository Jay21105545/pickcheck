# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Terminal renderer rebuilt to DESIGN.md's spec**: the summary card now
  draws a mini-bar per category (security/quality/docs/discipline/ui-ux/
  tokens) beneath the composite score bar, findings show a severity glyph
  (`✖ ▲ ●`, `x ! o` in ASCII) instead of an `ERROR`/`WARN `/`INFO ` text
  label, `file:line` is dimmed against the plain-text message, and every
  finding gets an `↳ fix:` hint line (dimmed, truncated to stay inside
  the ~100-col budget) carrying its `fixPrompt`. Score numbers and bars
  are the single accent color throughout (picocolors' nearest ANSI-16
  match to DESIGN.md's electric lime, since picocolors has no truecolor)
  regardless of value — no more red/yellow/green semaphore grading,
  matching DESIGN.md's "one sharp accent" direction. `NO_COLOR` and
  `TERM=dumb` degradation (verified by existing tests) is unchanged.
- `audit --quiet`: a single CI-friendly line — composite score plus the
  same rule/file/finding counts the summary card shows, nothing else.
  `--json` output is unaffected either way (it never touched the
  terminal renderer to begin with).
- The `astgrep` tier is implemented for real, replacing the stub:
  `@ast-grep/napi` is lazy-loaded (dynamic `import()` inside
  `runAstgrepTier()`, never at module scope) only once an astgrep-tier
  rule is actually dispatched, so the CLI's cold-start path pays nothing
  for it when no astgrep rule is loaded. `rule.pattern` passes straight
  through to `findAll()`; a malformed pattern (bad kind name, unknown
  field, …) throws synchronously and is caught, warned, and skipped like
  any other invalid rule — never crashes the audit.
- A new `manifest` tier and `sec/no-hallucinated-imports` (error): flags
  bare import/require specifiers absent from the *nearest* ancestor
  `package.json`'s dependency fields, unioned up to the scanned root —
  the same resolution order Node's own module system uses, so a
  workspace's per-package dependencies and its root-level tooling
  devDependencies are both recognized correctly. Respects `node:`
  builtins, relative imports, `@/`-style path aliases, and scoped/unscoped
  subpath imports. See [ADR 0007](DECISIONS/0007-manifest-tier.md).
- `qual/no-empty-catch` (error, astgrep): a `catch` block that's empty or
  contains only comments — structural, so formatting (minified, a call
  split across lines) doesn't affect detection and commented-out code
  doesn't false-positive.
- `qual/fetch-has-error-handling` (warn, astgrep): a `fetch()` call with
  no enclosing `try`/`catch`, `.ok` check, or `.catch` anywhere in the
  enclosing function — the v1 heuristic RULESET.md specs, with its
  binding-imprecision tradeoff stated in the rule's README.
- `sec/post-has-validation` (warn, regex + a new `pattern.unless`
  whole-file suppression on the regex tier — see
  [ADR 0008](DECISIONS/0008-regex-unless-precondition.md)): a
  `req.body`/`request.json()` read in a detected API-surface file with no
  `zod`/`yup`/`joi`/`valibot`/`class-validator` reference anywhere in that
  file. Ships as the heuristic it is — README states the same-file-only
  and proximity-not-binding limits honestly rather than papering over
  them.
- `disc/no-console-log` upgraded from `regex` to the `astgrep` tier RULESET.md
  always specified, now that the tier exists: catches a call split across
  lines and formatting-independent (minified) code, correctly ignores a
  commented-out call — the wins the regex-tier version's README already
  flagged as future work.
- Adversarial fixtures across the ruleset proving (or, where a tier
  provably can't win, honestly documenting the limit in the rule's README
  instead of faking a pass): a secret pasted whole into a template
  literal, an empty catch containing only a comment, commented-out
  offending code not false-positiving on the astgrep-tier rules, and a
  minified/single-line file still matching structurally.
- `examples/broken-app/` extended (`lib/api-client.ts`,
  `lib/analytics.ts`) to also trigger the four new rules — ten findings
  total, composite 31.88/100 (was 32.5/100, six findings).
- Phase 0 bootstrap: pnpm workspace (`packages/cli`, `packages/rules`,
  `packages/report`, `apps/docs` placeholder), tsdown/tsx/biome/vitest
  tooling, strict TypeScript config, GitHub Actions CI, and `DECISIONS/`.
- `pickcheck --version` CLI entry point.
- `pickcheck audit`: runs scan → load → dispatch → score → render
  end-to-end, with `--json`, `--min <score>` (default 60), `--rules-dir`,
  and an exit-code gate (0 if the composite score meets `--min`, else 1).
- First six rules, each with fixtures and a fix-prompt README:
  `sec/no-secrets-in-code`, `sec/no-env-in-git`, `docs/changelog-exists`,
  `docs/api-doc-exists`, `docs/env-example-exists`, `disc/no-console-log`.
- Conditional exists-tier rules via an optional `pattern.when` precondition
  (`docs/api-doc-exists`, `docs/env-example-exists` — see
  [ADR 0005](DECISIONS/0005-conditional-exists-precondition.md)).
- `examples/broken-app/`: a deliberately bad Next.js-shaped demo repo that
  triggers all six rules.
- A vitest fixture harness (`packages/cli/test/rules/fixtures.test.ts`)
  that auto-discovers every rule folder under `packages/rules` and asserts
  `fixtures/bad` triggers and `fixtures/good` doesn't; a rule missing
  either fixture direction fails the suite.

- `.pickcheckignore` (repo-root, `.gitignore` syntax): excludes
  legitimately-tracked content from audits without untracking it in git.
  This repo's own `.pickcheckignore` excludes `examples/`, so
  `examples/broken-app`'s intentional badness doesn't count against
  pickcheck's own self-audit (see [ADR 0006](DECISIONS/0006-scoring-recalibration.md)).

### Changed

- **Category scoring now uses diminishing returns, not a hard floor**
  ([ADR 0009](DECISIONS/0009-scoring-diminishing-returns.md), supersedes
  ADR 0006's category-aggregation step only — per-rule penalties, the
  per-rule cap, composite renormalization, category weights, and gating
  all carry forward unchanged): `categoryScore = 100 × CATEGORY_SCORE_K /
  (CATEGORY_SCORE_K + categoryPenalty)` replaces `clamp(100 -
  categoryPenalty, 0, 100)`. `CATEGORY_SCORE_K = 50` (equal to
  `PER_RULE_PENALTY_CAP` by design) preserves the exact same
  single-finding anchor (one capped rule still scores exactly 50), but a
  category no longer floors at exactly 0 the instant two capped rules
  co-occur — it keeps discriminating "bad" from "catastrophic"
  arbitrarily far past that point instead of going flat. Caught by
  running the ruleset against `examples/broken-app`: four new findings
  (6 → 10) barely moved the composite (32.5 → 31.88) because `security`
  had already floored at 0 from just two of the six original findings,
  and stayed there. `SCORING_GATES`' gate is reaffirmed as a **ceiling**
  (`min(composite, compositeCap)`, never raises a composite that's
  already below the cap) — this was already how `applyGates()` worked
  under ADR 0006, just previously worded ambiguously; no functional
  change there. `examples/broken-app` (now ten rules, ten findings) scores
  **43.09/100** (security 22.73, no longer an indistinguishable 0) and
  still exits 1.
- **Scoring recalibrated** ([ADR 0006](DECISIONS/0006-scoring-recalibration.md),
  supersedes ADR 0004's formula; category weights unchanged): additive,
  uncapped-by-division per-finding penalties (`SEVERITY_POINTS` ×
  `rule.weight`), a `PER_RULE_PENALTY_CAP` so one rule firing repeatedly
  can't zero its category alone, a composite renormalized over only the
  categories with an applicable rule (an empty category no longer
  contributes a free 100 at full weight), and a general, config-driven
  `SCORING_GATES` mechanism (`{ category, minSeverity, compositeCap }`)
  that forces the composite down regardless of the weighted mean — the
  shipped default caps at 59 on any error-severity security finding, one
  point under the CLI's default `--min 60`. `examples/broken-app` now
  scores 32.5/100 and exits 1 (was 96.85/100, exit 0).
- `biome.json` excludes `packages/rules/**/fixtures/**` from lint and
  format entirely — the same treatment `.pickcheckignore` already gives
  `examples/broken-app` and every rule's own `files` glob already gives
  every `fixtures/` dir for pickcheck's own self-audit. Fixture content is
  deliberately not idiomatic (an empty-catch fixture needs an unused
  binding, a rethrow fixture needs a catch biome calls "useless" by
  design, minified/multiline adversarial fixtures need to keep their
  exact unusual formatting), so it was never something to lint or
  format-enforce in the first place.

### Fixed

- `scanRepo()` now includes dotfiles (`.env`, `.env.example`, …) — every
  `micromatch` call site in the engine now passes `{ dot: true }` too, so
  a `!**/fixtures/**`-style exclusion glob actually excludes a nested
  dotfile instead of silently matching it anyway (see ADR 0005).
- `micromatch.some()` is not negation-aware — it tests each pattern in a
  list as its own independent matcher, so a lone `!**/fixtures/**`
  pattern matched almost anything by itself, silently breaking every
  `pattern.when` precondition and applicability check that mixed
  positive and negative globs. Replaced with
  `packages/cli/src/engine/glob.ts`'s `matchesAnyGlob()`, which filters
  correctly and checks for non-emptiness (see ADR 0006).
