# ADR 0021 — The published artifact is a self-contained bundle, and CI proves it

**Status:** accepted · **Date:** 2026-09-03

## Context

`pickcheck@0.1.0` was published and was **completely uninstallable**:

```
npx pickcheck@latest
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:^
```

The published `package.json` declared `@pickcheck/rules` and
`@pickcheck/report` as `dependencies` with pnpm's `workspace:^` protocol.
`changeset publish` shells out to plain `npm publish`, which does **not**
rewrite that protocol (only `pnpm publish` does), so it reached the
registry verbatim, where npm has no idea what `workspace:` means.

Fixing that alone would have produced a *second* broken release, because
the same investigation turned up three more failures stacked behind it —
each one individually fatal, and all four invisible locally:

1. **`workspace:^` in `dependencies`** — install fails outright. (The
   only one visible from outside; npm never gets far enough to hit the
   rest.)
2. **`@pickcheck/rules` was never in tsup's `noExternal`.** Only
   `@pickcheck/report` was added when DECISIONS/0019 fixed the equivalent
   bug for the report package. `dist/` still carried
   `import { ruleSchema } from "@pickcheck/rules/schema"` — a package the
   consumer, by design, never receives.
3. **The rule.yaml files never shipped at all.** Rules are *data*:
   `loadRules()` globs `**/rule.yaml` off disk, so esbuild cannot inline
   them the way it inlines a module. They lived only in
   `packages/rules/`, outside `files: ["dist"]`, in a package that is
   `private: true` and therefore can never be fetched from npm. A fixed
   install would have found **zero rules**.
4. **`docs-kit/` and `generators/` never shipped either**, for the same
   reason plus one more: `repo-paths.ts` located them by walking *up*
   from the CLI package (`<pkg>/../..`), which resolves to the monorepo
   root in development and to **the consumer's own project root** in an
   install. `pickcheck init` died on
   `ENOENT: .../docs-kit/CHANGELOG.md`.

**Why none of this was caught:** every test, every `self-audit`, and
every manual check ran *inside this pnpm workspace*, where all four
broken paths resolve fine through workspace symlinks and monorepo-
relative arithmetic. `npm pack --dry-run` was run before 0.1.0 and looked
correct — it lists what's in the tarball, and cannot tell you that what's
in the tarball is insufficient.

## Decision

**The published package is a self-contained bundle.** Nothing it needs at
runtime may live outside its own tarball.

- **Code** from the internal workspace packages is inlined by tsup:
  `noExternal: ["@pickcheck/report", "@pickcheck/rules"]`. Both are
  `devDependencies` — never `dependencies` — since a consumer must never
  be asked to resolve them. (This also pulls `zod` into the bundle, since
  it's the rules schema's own dependency and not a declared dependency of
  `pickcheck`; that's correct, and grows the bundle to ~720KB.)
- **Data** — rule.yaml, `docs-kit/`, `generators/` — is copied into
  `dist/` by `scripts/copy-runtime-assets.mjs` as the final step of
  `build`, and reaches npm via the existing `files: ["dist"]`.
- **Path resolution** prefers the shipped copy and falls back to the
  monorepo layout: `defaultRulesDir()` (audit.ts) and `assetDir()`
  (repo-paths.ts) both check `dist/`-relative first, then the workspace.
  The fallback exists solely so source runs (tsx, vitest, `pnpm dev`)
  keep working; it is dead code in a published install.

**CI proves it, rather than trusting review.**
`packages/cli/test/publishable-package.test.ts` asserts, against the real
files on disk: no `workspace:`/`link:`/`portal:`/`file:` protocol in any
install-affecting field; no `@pickcheck/*` in those fields at all; every
range registry-shaped; no `@pickcheck/*` import surviving in the built
bundle; and the three data directories present in `dist/`. The guard was
verified by reintroducing the exact 0.1.0 bug and confirming it fails
(3 of 8 tests, with actionable messages) before reverting.

`workspace:` in **devDependencies** is deliberately still allowed: npm
does not resolve devDependencies for consumers, and the clean-install
test below is the empirical proof that it's harmless.

## Consequences

- **A clean-room install test is now the release gate**, not `npm pack
  --dry-run`: build → `npm pack` → `npm install <tarball>` into a temp
  dir *outside* this workspace → run `audit`, `audit --report`, `init`,
  and `gen api` from it. Only this catches the "resolves in the monorepo,
  missing when installed" class. All four commands were verified passing
  this way before 0.1.1; `npm pack --dry-run` alone was verified passing
  before 0.1.0 and told us nothing.
- Adding a future workspace package that the CLI imports means adding it
  to `noExternal` too, and to `devDependencies` — never `dependencies`.
  The guard test fails loudly if that's forgotten.
- Any new runtime data directory must be added to
  `copy-runtime-assets.mjs` and given the same shipped-first path
  resolution; the guard's data-asset assertion should grow with it.
- `CONTRIBUTING.md`'s "Releasing" section now carries the clean-install
  test as a required step before any publish.
