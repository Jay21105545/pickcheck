# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Fixed

- `scanRepo()` now includes dotfiles (`.env`, `.env.example`, …) — every
  `micromatch` call site in the engine now passes `{ dot: true }` too, so
  a `!**/fixtures/**`-style exclusion glob actually excludes a nested
  dotfile instead of silently matching it anyway (see ADR 0005).
