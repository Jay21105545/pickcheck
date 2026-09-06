# pickcheck

## 0.3.0

### Minor Changes

- 4d99704: Fix two false positives on control repos, and ship two new rules.
  
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

### Patch Changes

- 910f747: Rewrite the README as the project's front door, and correct the npm package
  metadata.
  
  The README now leads with what pickcheck is for — AI writes the happy path
  and skips the sad path; this is the inspection that catches what it skipped
  — and carries the full 13-repo corpus table with its `stack` and
  `provenance` columns, the published precision history (36% → 90% after
  calibration; `sec/no-hallucinated-imports` 1.3% → 56.4% after the `extends`
  fix; `ux/hardcoded-px-width` pulled at 18% rather than shipped noisy), and
  the honest limits from DECISIONS/0029 — that the original corpus confounded
  stack with provenance, and that two candidate rules were dropped for
  tracking the framework rather than the generator.
  
  The published `description` omitted the `quality` category, listing five of
  the six scored axes; it now lists all six. Keywords are aligned with the
  repository's topics for discoverability. No rule or engine behaviour
  changed.
- 21e9934: Correct the README's corpus claim. The backtest corpus grew from 8 repos to
  13 (DECISIONS/0029), adding the two cells it was missing — AI-generated
  Next.js apps and professionally-built Vite/React SPAs — so that "separates
  AI-generated from human-built" is no longer indistinguishable from
  "separates Vite from Next.js". With those cells filled, the old claim that
  every control repo scores above every AI-generated one is false, and the
  README now shows the full 2x2 and names the overlap. No rule or engine
  behaviour changed.

## 0.2.0

### Minor Changes

- 8b495a4: Add three rules for the backend seam — the layer the ruleset had no
  vocabulary for — plus a `when` precondition on the regex tier.
  
  Every previous rule assumed the app's data layer either throws on failure
  or goes out over `fetch`. The AI-generated arm of the backtest corpus is
  Vite + React + Supabase, where neither is true, and re-reading it by hand
  found three defect classes nothing was looking for:
  
  - **`sec/edge-function-no-auth`** (error) — a Supabase Edge Function
    declared `verify_jwt = false` in `supabase/config.toml`. That flag makes
    the function callable by anyone who learns its URL while it still runs
    with the project's server-side secrets. The corpus has two, both
    unauthenticated proxies that forward the caller's input to an LLM
    gateway on the owner's API key with no quota and no rate limit.
  - **`qual/supabase-result-unchecked`** (warn) — a Supabase call whose
    result is discarded. supabase-js never throws; it resolves with
    `{ data, error }`, so a write blocked by row-level security returns as
    success and a surrounding `try`/`catch` does nothing. Nine in the
    corpus, including one that discards a `profiles` update and then renders
    "Welcome back!", and two that discard the write to a rate-limit counter.
    Scoped to `from`/`rpc`/`functions.invoke`; `auth` and `storage` are
    excluded on measurement.
  - **`qual/simulated-backend`** (warn) — a submit, checkout or save handler
    whose only asynchronous work is `await new Promise(r => setTimeout(r,
    ms))`, in a file that makes no network call at all. The corpus case
    collects card details, waits 1.5s, and renders "Payment Successful!".
    Deliberately narrow: triggering on any `setTimeout` under the same
    conditions catches two more real cases but takes a debounce, an
    optimistic-UI revert and a toast timer with it.
  
  The regex tier gains `pattern.when`, the mirror of the existing
  `pattern.unless`: a whole-file content precondition, so a rule can require
  context that isn't on the matched line. Existing rules are unaffected.
  
  All four control repos score identically before and after. The thirteen
  new findings are all on the AI-generated arm, every one hand-classified:
  12 true positives, 1 arguable, 0 false positives. See DECISIONS/0028.
- 13b1bda: Teach four shipped rules what a serverless, Supabase-shaped app actually
  looks like, and implement `docs/env-example-exists` as RULESET.md §6
  always specified it.
  
  All four rules were calibrated against Next.js control repos and had
  drifted from what their own READMEs claimed to detect. Measured against
  the 8-repo backtest corpus:
  
  - **`ux/destructive-no-confirm`** matched **0 of the 17** real delete call
    sites, because it knew only `axios.delete(` and `method: "DELETE"`. It
    now also matches `.delete()` with empty parens (the discriminator that
    separates a query-builder delete from `newSet.delete(id)` and
    `params.delete("q")`), `deleteDoc(`, and a `*delete*`/`*destroy*`-named
    Server Action bound via `action={…}` or `useActionState(…)`. `remove` is
    deliberately excluded — measured, it only ever fired on control repos,
    where it flagged a shopping-cart line-item removal.
  - **`disc/no-console-log`** no longer flags `supabase/functions/**` or
    `netlify/{functions,edge-functions}/**`, where `console.log` is the
    platform's supported observability mechanism rather than leftover
    debugging. Removes 37 false findings from one corpus repo.
  - **`sec/post-has-validation`** and **`docs/api-doc-exists`** now cover
    those same serverless directories. `sec/post-has-validation` also
    matches `req.body`/`request.body` and `await …req.json()`, where it
    previously hardcoded `request` for the `.json()` form and so saw none of
    the corpus's unvalidated bodies even once the glob was widened.
  - **`docs/env-example-exists`** now triggers on the code actually reading
    environment variables (`process.env`, `import.meta.env`, `Deno.env.get`)
    and requires ≥60% of them to be documented, naming the missing keys —
    instead of only checking that `.env.example` existed at all whenever a
    `.env` was on disk. A key whose absence the code handles
    (`process.env.X && …`, `… ?? fallback`) is correctly treated as
    optional.
  
  Adds a `coverage` tier to support that last one: set coverage between
  identifiers extracted from source and identifiers declared in a
  documentation file. All four control repos score identically before and
  after; the ten new findings are all on the AI-generated arm, hand-reviewed
  at 87.5% precision. See DECISIONS/0027.

## 0.1.4

### Patch Changes

- 5b7c0ae: Refuse to run on an unsupported Node with a message that names both
  versions, instead of failing later from inside a dependency.
  
  `engines` is advisory — npm only enforces it under `engine-strict` — so
  installing on a Node below the `>=22.12.0` floor succeeds and stays
  silent until something breaks somewhere unhelpful. The bin entry now
  checks the runtime against that declared floor first and exits 1 with
  `pickcheck requires Node.js >=22.12.0, but this is Node.js v20.11.1.`
  
  The CLI moved to `src/cli.ts` behind a dynamic import so the check can
  actually run: static imports are hoisted and evaluated before any of the
  importing module's own statements, so a statically imported commander
  would load on precisely the runtimes the check exists to catch. See
  DECISIONS/0025.
- 5b7c0ae: Stop flagging real dependencies as hallucinated imports when auditing a
  subdirectory of a monorepo.
  
  `cd packages/cli && pickcheck audit` reported `tsup.config.ts`'s
  `import { defineConfig } from "tsup"` as a hallucinated import, because
  `tsup` is declared in the monorepo root's package.json and manifest
  resolution stopped at the scan root. It now continues above the scan
  root, bounded both ways: it doesn't start if the scan root is itself a
  project root, it stops inclusively at the first project root above
  (`.git`, `pnpm-workspace.yaml`, or `package.json#workspaces`), and it
  contributes nothing if none is found. Only manifests are read up there —
  no file above the scan root is scanned or reported on. See
  DECISIONS/0026.

## 0.1.3

### Patch Changes

- Fix the npm package page and stop lying about the supported Node version. The README's screenshot and every relative link (CONTRIBUTING.md, LICENSE, DECISIONS/, packages/rules/, ARCHITECTURE.md) now use absolute URLs, so they render on npm as well as GitHub — npm cannot resolve repo-relative paths, so the screenshot was broken and every link 404'd. `engines.node` is raised from `>=18` to `>=22.12.0` to match what we actually ship: `commander@15` requires `>=22.12.0` and `@clack/prompts` requires `>=20.12.0`, so the old `>=18` claim was false and produced a wall of `EBADENGINE` warnings on install. Node 18 and 20 are both past end-of-life. Installs on Node 22.12+ are now warning-free. See DECISIONS/0024.

## 0.1.2

### Patch Changes

- Never audit build output. Running `audit` on a Next.js app returned ~45 of 49 findings from `.next/` — webpack chunks and polyfills, not source. `.gitignore` parsing was fine; the causes were that there was no default ignore set, that a root `.gitignore`'s anchored `/.next/` never matches a nested `apps/web/.next/`, and that only the root `.gitignore` is ever read. Generated output is now ignored by default (`.next/`, `dist/`, `build/`, `out/`, `.output/`, `.svelte-kit/`, `.nuxt/`, `.turbo/`, `.vercel/`, `coverage/`, `__pycache__/`, `target/`, `.pickcheck/`, `*.min.js`, `*.min.css`, `*.bundle.js`), matching at any depth and overridable with a `!` negation in `.pickcheckignore`. Files are additionally classified as generated by content — a `sourceMappingURL` comment or a mean line length of 500+ — to catch bundlers not on that list. See DECISIONS/0023.

## 0.1.1

### Patch Changes

- Fix an uninstallable package. 0.1.0 declared the internal `@pickcheck/rules` and `@pickcheck/report` workspace packages as `dependencies` using pnpm's `workspace:^` protocol, which npm cannot resolve — `npx pickcheck` failed with `EUNSUPPORTEDPROTOCOL`. They are now `devDependencies`, bundled into `dist/` at build time. Three further shipping gaps found while fixing it are also resolved: `@pickcheck/rules` is now inlined by the bundler, and the rule.yaml files, `docs-kit/`, and `generators/` are now copied into `dist/` so they actually reach npm — without them a fixed install would have had zero rules and crashed `init`/`gen` with `ENOENT`. See DECISIONS/0021.

## 0.1.0

### Minor Changes

- Initial release: audit, init, and gen commands with 20 rules across six categories.
