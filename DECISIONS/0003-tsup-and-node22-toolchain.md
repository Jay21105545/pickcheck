# ADR 0003 — tsup over tsdown; Node 22 pinned for the dev/CI toolchain

**Status:** accepted · **Date:** 2026-09-02

## Context
EXECUTION.md's stack table locks tsdown (fallback: tsup) for the build and
vitest for tests, with no documented fallback for vitest. During Phase 0
bootstrap the local/CI baseline Node was 20.11.1. tsdown's rolldown
dependency, and separately vitest 4's vite dependency (also rolldown-based),
both import `styleText` from `node:util` at module load — an API added in
Node 20.12. Both tools crashed immediately on `pnpm build` / `pnpm test`,
before reaching any CLI or test code.

## Options
1. Downgrade vitest to a pre-rolldown-vite major to keep Node 20.11 as the
   floor.
2. Shim `node:util` to fake `styleText` so old Node keeps working.
3. Raise the dev/CI Node floor to ≥20.12 and keep tsdown as specified,
   swapping to tsup only if tsdown itself still failed on the newer Node.
4. Swap tsdown → tsup (the fallback EXECUTION.md already names) to drop the
   rolldown dependency from the build step, and separately raise the Node
   floor for vitest, which has no such fallback.

## Decision
Option 4 — two separate fixes for two separate causes:
- **tsdown → tsup.** EXECUTION.md already names tsup as the sanctioned
  fallback, so this isn't a new deviation so much as using the documented
  escape hatch. `tsup.config.ts` mirrors the intended `tsdown.config.ts`
  (`format: esm`, `platform: node`, `target: node18`); the `build` script
  name is unchanged so nothing downstream needed to know.
- **Node 22.22.0 (LTS) pinned via `.nvmrc`; CI reads it via
  `node-version-file`.** vitest is locked with no fallback and needs the
  same `styleText` API. Rather than downgrade a pinned dependency or shim a
  Node builtin to keep an old runtime alive, the dev/CI toolchain floor
  moved to a Node version that actually has the API. This does **not**
  change the CLI's published runtime target: `tsup.config.ts` still builds
  `target: node18`, and root/cli `package.json` still declare
  `engines: ">=18"`. Only the Node version used to *build, lint, and test*
  this repo moved — the Node 18+ hard constraint in CLAUDE.md is about what
  the shipped binary runs on, not what builds it.

Rejected 1 (pins the test runner behind an old major indefinitely — the same
crash returns the moment any other dependency pulls in rolldown) and 2
(shimming a Node builtin to keep a stale runtime alive is exactly the kind
of workaround CLAUDE.md's guidance to fix the underlying cause rather than
paper over it warns against).

## Consequences
- Contributors need Node ≥20.12 to work on pickcheck itself; `.nvmrc` pins
  22.22.0 so `nvm use` picks it up automatically. The Node 18+ floor for the
  *published* CLI is unchanged.
- `packages/cli/tsup.config.ts` exists where `tsdown.config.ts` would have.
  If a future tsdown release lifts its Node requirement, reverting is a
  small, isolated change — script name and bundler options are equivalent.
- `.github/workflows/ci.yml` reads Node version from `.nvmrc`
  (`node-version-file`) instead of a hardcoded number, so local and CI stay
  in lockstep by construction.
- EXECUTION.md's stack table is updated alongside this record to show tsup
  as current and to record the Node ≥20.12 tooling floor.
