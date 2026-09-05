---
"pickcheck": minor
---

Fix two false positives on control repos, and ship two new rules.

`sec/no-hallucinated-imports` now follows `tsconfig.json` `extends` chains
and treats a specifier claimed by a `compilerOptions.paths` pattern as a
local alias rather than an npm package. Reading only one config file deep,
it flagged 1,655 path-aliased imports on a human-built control repo as
undeclared packages, at `error` severity. Corpus-wide precision for the
rule goes from 1.3% to 56.4% with no loss of recall.

`docs/env-example-exists` now ignores Vite's built-in `import.meta.env` set
(`BASE_URL`, `MODE`, `PROD`, `DEV`, `SSR`) — the same class of
platform-injected values it already ignores for `NODE_ENV` and `SUPABASE_*`.

Two new rules:

- **`qual/no-typecheck-anywhere`** (quality, warn) — nothing in the project
  ever runs the TypeScript compiler: no `typecheck` script, no CI step, and
  no framework build that would catch a type error. Credits `next build`,
  which type-checks by default, unless `typescript.ignoreBuildErrors`
  switches that off.
- **`disc/builder-metadata-left-behind`** (discipline, info) — the AI
  builder's scaffolding is still in the repo: a `lovable-tagger`
  dependency, an injected `gptengineer.js` script tag, v0's README sync
  line, or an unrenamed template package name.

Both are new capabilities rather than tightened patterns, so existing
projects may see new findings. See DECISIONS/0030.
