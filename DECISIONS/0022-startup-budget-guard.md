# ADR 0022 — Lazy-load the rule schema; guard the startup budget by bundle size, not by timing

**Status:** accepted · **Date:** 2026-09-03

## Context

Fixing the uninstallable 0.1.0 (DECISIONS/0021) required inlining
`@pickcheck/rules` into the bundle, which pulled its own dependency —
zod, ~713KB — along with it. Two modules imported the schema at module
scope, so zod landed on the startup path of *every* command:

- `engine/loader.ts` — `import { ruleSchema }`, the real consumer.
- `engine/history.ts` — `import { CATEGORIES }`, a plain string tuple,
  but importing anything from that module loads the whole thing.

Measured cost: `pickcheck --version`, which never touches a rule, paid
~18ms to parse a schema it would never use. Total import cost was ~60ms
against ARCHITECTURE.md's "bin entry imports < 50ms before command
dispatch" — over budget.

## Decision

### 1. Lazy-load the schema

`loadRules()` now does `await import("@pickcheck/rules/schema")` inside
the function, matching how the astgrep and tokens tiers already
lazy-load `@ast-grep/napi` and `gpt-tokenizer`, including the same
"failed import degrades to a warning, never a crash" handling.

`history.ts` validates categories against `CATEGORY_WEIGHTS`' keys
(scorer.ts, already on the startup path) instead of the schema's
`CATEGORIES` tuple. The two are the same set by construction:
`CATEGORY_WEIGHTS` is a `Record<Category, number>`, so a category added
to the schema without a weight fails to compile. This keeps one runtime
source of truth without dragging zod along.

Result: zod moved into its own lazily-loaded chunk. Import cost **60ms →
41.6ms**, inside the 50ms budget, with the eager graph down to ~68KB.

### 2. Guard the budget with bytes, not milliseconds

A timing gate in CI was built and then rejected as too flaky to ship.

Locally the measurement is excellent — min-of-7 runs with a `node -e ""`
baseline subtracted gives 41.2–42.2ms across 10 independent samples, a
~1ms spread. But baseline subtraction only cancels a *constant* offset.
The import work itself scales with machine speed, so a contended CI
runner at half speed reports ~83ms with nothing regressed. An absolute
millisecond threshold on shared runners is a false-alarm generator, and a
gate that cries wolf gets disabled, which is worse than no gate.

So CI asserts on what's deterministic — the size of the eagerly-loaded
module graph (`index.js` plus its *static* chunk imports), budgeted at
150KB against ~68KB actual — plus a targeted "no zod in the eager graph"
check. Bytes don't vary with runner contention.

The threshold is deliberately a tripwire, not a golden file: it catches
"a 700KB dependency moved onto the startup path" (the actual failure
mode, three orders of magnitude past any noise floor) without needing an
update every time a few lines of CLI code are added.

`scripts/measure-startup.mjs` (`pnpm --filter pickcheck run
measure-startup`) keeps the real timing available as a local diagnostic,
where the environment is controlled enough for it to mean something.

## Consequences

- Anything heavy added to a startup-path module must become a dynamic
  `import()`; the size guard fails loudly with a message pointing at
  `loader.ts` as the pattern to copy. Verified by reintroducing the eager
  schema import: the guard reported 781.7KB against the 150KB tripwire
  and the zod-specific check failed too.
- `.github/workflows/ci.yml` gained a `pnpm build` step **before** `pnpm
  test`. The artifact guards from DECISIONS/0021 and this record all read
  `dist/`, and CI previously built only in `self-audit`, which runs last
  — so those tests would have failed on a fresh checkout. Caught by
  simulating a clean CI run locally (`mv dist` away and re-running).
- The 50ms figure in ARCHITECTURE.md stays the stated budget and the
  local script's default; CI enforces the byte proxy for it.
