# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`pickcheck audit --report [path]`** (Phase 4, DECISIONS/0019): writes a
  single self-contained HTML report (default `.pickcheck/report.html`,
  path overridable) — animated radial composite score with a trend delta
  against the previous run, a hand-rolled SVG radar chart of the category
  axes, finding cards grouped by category with a severity-coded left
  border, an expandable code snippet (offending line highlighted), and a
  "Copy fix prompt" button, plus the unscored AI-context-surface report
  as a token treemap. Zero network: CSS/JS/data all inline, no CDN, no
  external fonts — opens from `file://` forever. Dark-first per
  DESIGN.md's palette with a manual light toggle; keyboard-navigable
  (native `<details>`/`<button>`), real contrast, no color-only meaning.
  `--report` is additive to `--json`/`--quiet`/the terminal renderer, not
  a replacement mode.
- **`.pickcheck/history.json`**: every `audit` run (not just `--report`
  ones) appends `{ timestamp, composite, categories, findingCount,
  rulesetVersion }`, capped at the 200 most recent runs.
  `rulesetVersion` is a content fingerprint of the loaded rules (sha256
  of each rule's `id@severity@weight@tier`, sorted), not a hand-bumped
  package version, so it changes automatically whenever the ruleset
  actually does — the report flags a trend delta as "not a pure
  comparison" when it doesn't match the previous run's.
- **`pnpm corpus`**: promotes EXECUTION.md's Stress-Test & Backtest
  Protocol from a one-off manual run (DECISIONS/0014) into permanent
  infrastructure. Clones/updates a pinned-by-commit-SHA set of real repos
  (`corpus/repos.json`) into a gitignored cache, runs the built CLI
  against each, and diffs the result against committed snapshots
  (`corpus/snapshots/`) — reporting exactly which findings were
  added/removed, per repo and per rule, and exiting non-zero on any diff.
  `pnpm corpus -- --update` accepts the current run as the new baseline.
  Seeded with the 4 repos from DECISIONS/0014 plus 4 confirmed
  Lovable-generated apps (real `lovable-dev`-topic-tagged repos, not
  merely AI-tool-friendly boilerplate) — the corpus was missing the exact
  population pickcheck targets, which is why `ux/fetch-missing-states`
  had never fired on real code before this. It now does: 5 genuine
  findings on one of the four AI-generated apps' real external-API news
  feed, none on the other three (two of which fetch exclusively via a
  Supabase client the rule's `fetch`/`axios`/`useQuery`/`useSWR` pattern
  list doesn't recognize — a real recall gap, noted for future work, not
  a precision problem).
- `CONTRIBUTING.md` (new, repo root — distinct from `docs-kit/
  CONTRIBUTING.md`, which is the template `init` copies into *other*
  repos): documents the corpus-diff requirement for any rule or engine
  change, and how to add a repo to the corpus.
- `disc/no-console-log` now also excludes `corpus/**` (alongside its
  existing `**/scripts/**` exclusion) — `corpus/run.ts`'s console output
  is its intended reporting mechanism, not a stray debug statement.

### Changed

- **`ux/inline-hex-threshold` now distinguishes a hex literal's role, not
  just its presence** (DECISIONS/0019): a negative lookbehind excludes a
  hex value only when it's the value of a CSS custom-property
  *declaration* (`--token-name: #hex;`) — the token *definition* site —
  while still counting the identical literal anywhere else (`color:
  #hex`, inline `style={{ color: "#hex" }}`, etc.). Surfaced by
  `packages/report/src/palette.ts` (a genuine, single-source-of-truth
  design-token file) false-positiving; fixed as a detection-precision
  improvement rather than a path exclusion, since `fixtures/bad/src/
  Palette.tsx` already exists specifically to prove naming a file
  "Palette" doesn't exempt scattered inline-style hex. `pnpm corpus`
  against all 8 corpus repos: no diff.
- **First real-world ruleset calibration** (DECISIONS/0014): ran the
  Phase-3 `ux/*`/`tok/*` rules against 4 real repos with actual data
  fetching, forms, and destructive actions (`shadcn-ui/taxonomy`,
  `nextjs/saas-starter`, `vercel/commerce`, `steven-tey/precedent`) and
  hand-classified all 37 findings — aggregate precision was 36%. Fixed
  every identified false-positive pattern and re-ran the same sample:
  precision rose to 90% across 11 remaining findings, with every prior
  true positive still caught and every prior false positive gone.
  - `ux/input-missing-label` now exempts spread-prop elements
    (`<input {...props} />`), matching `ux/img-missing-alt`'s existing
    clause — both real-world false positives were the same shadcn/ui
    `<Input>` primitive.
  - `ux/fetch-missing-states` and `ux/inline-hex-threshold` now exclude
    Next.js's special convention files (`opengraph-image`,
    `twitter-image`, `icon`, `apple-icon`); the hex rule additionally
    excludes `**/icons/**`, `**/logos/**`, `**/brand/**` (real brand-icon
    SVGs use externally-mandated colors, not drifting design tokens).
  - `ux/form-submit-no-pending` now exempts sign-out/log-out buttons (no
    real double-submission consequence), checking both `aria-label` and
    rendered text anywhere in the button's subtree.
  - Every fixed pattern got a `fixtures/good/` sample built from the real
    shape that triggered it, so the regression can't silently return.
- **`ux/hardcoded-px-width` pulled from the shipped ruleset** — measured
  at 18% precision (three compounding regex bugs: no word boundary
  before `width` matching inside `min-width`/`max-width`, and Tailwind
  breakpoint-variant prefixes not recognized). Moved to
  `packages/rules/_incubating/`, which `loadRules()` now excludes from
  loading; its README documents the specific bugs and recommends an
  `astgrep`-tier rewrite. Not deleted — resumable.

### Added

- **UI/UX rules (Phase 3)**: `ux/fetch-missing-states` (a component
  fetches data but nothing in the file suggests it renders a loading,
  error, or empty state — the signature AI happy-path-only failure),
  `ux/img-missing-alt`, `ux/input-missing-label`,
  `ux/onclick-non-interactive` (`onClick` on a `<div>`/`<span>` with no
  `role`+`tabIndex`), `ux/form-submit-no-pending`,
  `ux/destructive-no-confirm` (a DELETE call with no confirmation step),
  `ux/inline-hex-threshold`, and `ux/hardcoded-px-width`. All eight ship
  as `warn` with honest README limits — see each rule's own README for
  its specific false-positive tradeoffs.
- **Tokens tier, implemented for real** (replacing the Phase-1 stub):
  `pattern.check` now discriminates three checks —
  `tok/context-file-budget` (a CLAUDE.md/AGENTS.md/.cursorrules/etc. over
  a token budget, via `gpt-tokenizer`, lazy-loaded and fully local),
  `tok/context-duplication` (verbatim paragraphs shared across two
  context files), and `tok/ai-ignore-coverage` (a lockfile/node_modules/
  build dir present on disk with no `.cursorignore`/`.claudeignore`/
  equivalent covering it) — see [ADR 0012](DECISIONS/0012-tokens-tier-discriminated-checks.md).
- **AI-context-surface report**: `audit` now prints an unscored "AI
  context surface: N tokens across M files · est. W% waste" block (with
  a per-file breakdown) whenever context files are found — informational
  only, never affects the composite or category scores — see
  [ADR 0013](DECISIONS/0013-unscored-token-surface-report.md).
- **Regex tier gains `pattern.minCount`**: an optional per-file
  occurrence threshold — a rule fires once, not once per line, only once
  a pattern crosses a repeat count across the whole file (used by
  `ux/inline-hex-threshold`) — see [ADR 0011](DECISIONS/0011-regex-mincount-threshold.md).
- `examples/broken-app` extended with components/styles that trigger all
  eight new UI/UX rules and all three tokens rules, documented in its
  own README. `biome.json` now excludes `examples/` from linting the same
  way it already excludes `packages/rules/**/fixtures` — deliberately bad
  demo content per DECISIONS/0006, not real source held to the repo's own
  quality bar (its new a11y-violating components tripped Biome's own
  `useAltText`/`useButtonType`/`useKeyWithClickEvents` rules, which is the
  point).
- This repo's own `.cursorignore`/`.claudeignore` added at the root so
  pickcheck's self-audit passes `tok/ai-ignore-coverage` honestly (it
  already had a tracked `pnpm-lock.yaml` and `node_modules`, neither
  previously excluded from AI-assistant context).
- **`pickcheck init`**: an interactive (`@clack/prompts`, see
  [ADR 0010](DECISIONS/0010-clack-prompts-for-init.md)) scaffolder that
  detects the target repo's stack (`package.json` or `requirements.txt` —
  package manager, framework, install/test/lint commands) and writes a
  docs-kit — `CHANGELOG.md`, `API.md`, `ARCHITECTURE.md`,
  `DECISIONS/0001-record-architecture-decisions.md`, `CONTRIBUTING.md`,
  `.github/PULL_REQUEST_TEMPLATE.md`, a stack-aware `CLAUDE.md`/`AGENTS.md`,
  a `.github/workflows/pickcheck.yml` CI gate, and a `.env.example` seeded
  with keys found in any existing `.env` (values stripped) — into it.
  Never overwrites a file that already exists; skips it with a notice
  instead. Non-interactive via `--yes` or a non-TTY stdin (so it's
  scriptable in CI and in this project's own tests), with `--min` and
  `--assistants` to set the CI gate's threshold and which conventions
  file(s) to write without answering prompts.
- **`pickcheck gen api`**: detects the target repo's API surface
  (`app/api/**`, `pages/api/**`, `routes/**`, `src/routes/**`, `api/**`,
  falling back to a marker scan — `express()`, `Fastify(`, `FastAPI(`,
  `Flask(__name__` — in common entry files when no routes directory
  exists), embeds every matched route's real source into
  `generators/api.md`'s prompt template, and writes the result to
  `pickcheck-prompt.md`. No LLM calls — the user pastes the prompt into
  their own assistant, per ADR 0002.
- **`pickcheck gen changelog`**: groups `git log` (since the last tag, or
  the most recent 200 commits if there's no tag yet) by conventional
  commit type and embeds the grouping into `generators/changelog.md`'s
  prompt template, writing `pickcheck-prompt.md` — same no-LLM-calls
  contract as `gen api`.
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
- `pnpm self-audit`: builds `@pickcheck/cli` and runs it against this
  repo with `--min 90`, wired into CI as a required step alongside
  `typecheck`/`test`/`check`. Currently scores **100/100** (10 rules, 154
  files, 0 findings).
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
