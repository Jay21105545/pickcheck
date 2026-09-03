# ADR 0007 — A `manifest` tier for manifest-aware rules

**Status:** accepted · **Date:** 2026-09-02

## Context
RULESET.md's `sec/no-hallucinated-imports` needs to flag bare import/require
specifiers that aren't declared in `package.json` — catching both broken
builds and slopsquatting exposure (an AI assistant inventing a plausible but
nonexistent package name). Detecting the specifier is a regex-tier-shaped
problem (extract the quoted string after `from`/`require(`/`import(`), but
deciding whether it's a *finding* requires cross-referencing a second file
(`package.json`) and applying platform-level exemptions (Node builtins,
relative imports, npm scoped-subpath resolution) that no existing tier can
express:

- `exists` only checks file presence/absence.
- `regex` tests a pattern per line against the *same* file being scanned —
  it has no notion of a second, cross-referenced file.
- `astgrep` matches AST structure; it has no I/O or manifest-reading
  capability, and encoding "read JSON, compare a set of strings" as a tree
  pattern doesn't fit the tool.
- `tokens` counts tokens against a budget — unrelated.

CLAUDE.md is explicit here: "the engine never contains rule-specific code.
If a rule needs new engine capability, add a new detection tier, not a
special case."

## Options
1. Special-case `sec/no-hallucinated-imports` in the regex tier (read
   `package.json` only when `rule.id` matches).
2. Extend the regex tier's schema with an optional manifest cross-reference
   that any regex rule could opt into.
3. A new `manifest` tier: same shape as `regex` (a `pattern.regex` with one
   capture group, rule data), plus generic engine capability — resolve the
   captured specifier's package name and check it against a manifest file's
   declared dependency fields.

## Decision
Option 3. It keeps the "rules are data" boundary intact (the *what counts as
an import* extraction is still a plain regex in rule.yaml, same as the regex
tier) while giving the engine one new, reusable capability: read a JSON
manifest, union the given `dependencyFields` into a name set, and resolve a
specifier to the package name that would need to be in that set. That
resolution step is genuinely generic — not `sec/no-hallucinated-imports`-
specific — so it belongs in engine code, not rule data:

- **Node builtins** (`fs`, `node:fs`, `fs/promises`, …) are read from
  `node:module`'s `builtinModules` at runtime — this is Node platform
  truth, not repo data, so it's never something a rule.yaml should have to
  enumerate.
- **Relative/absolute imports** (`./x`, `../x`, `/x`) aren't package
  installs at all and are always exempt.
- **`@/`-style path aliases** (Next.js/tsconfig `paths`, e.g. `@/components/
  Button`) are exempt: `@` immediately followed by `/` has no scope name,
  so it can't be a real npm scoped package (`@scope/name`) either.
- **Subpath imports** (`lodash/debounce`, `@pickcheck/rules/schema`)
  resolve to the *package* name (`lodash`, `@pickcheck/rules`), matching
  what would actually appear as a `package.json` dependency key.
- **Workspace-protocol packages** need no special handling at all: a
  `package.json` entry like `"@pickcheck/rules": "workspace:^"` is still a
  key in `dependencies`, so the plain declared-name lookup already treats
  it as installed.
- **Type-only imports** (`import type { X } from "pkg"`) are extracted by
  the same regex as a normal `from '...'` import — no special casing
  needed, since `type` sits between `import` and `{`, outside what the
  pattern captures.

Option 1 was rejected outright per CLAUDE.md's "never a special case."
Option 2 was rejected because a manifest cross-reference isn't a small
optional add-on to the regex tier's contract (a per-line pattern test) — it
changes what "a match" means (a match is only a finding if a *second*
lookup also fails), which reads better as its own tier than as regex-tier
scope creep future regex rules would have to reason about.

## Consequences
- `TIERS` gains `"manifest"`; `ruleSchema`'s discriminated union gains
  `manifestRuleSchema` (`pattern: { regex, flags?, manifestFile (default
  "package.json"), dependencyFields }`).
- `packages/cli/src/engine/tiers/manifest.ts` is the only engine file that
  knows about `builtinModules`, path-alias shape, and subpath resolution —
  reusable by any future manifest-aware rule, not just this one.
- **Manifest resolution is per-file, unioning every ancestor manifest up
  to the scanned root — not a single fixed manifest anywhere.** This went
  through two rounds of "caught by running it for real," not designed in
  from the start:
  1. The first implementation read one `<cwd>/package.json` for the whole
     scan. Running it against pickcheck's own repo (a pnpm workspace —
     `packages/cli`, `packages/rules`, …) flooded 25 false positives on
     real, correctly-declared dependencies (`micromatch`, `zod`,
     `@pickcheck/rules`, …) that live in each package's *own*
     `package.json`, not the workspace root's.
  2. Fixed by resolving the *nearest* ancestor manifest per file instead
     (stop at the first `pattern.manifestFile` found, walking up from the
     file's directory). That dropped 23 of the 25 — but the remaining 2
     were real too: `packages/cli/tsup.config.ts` importing `tsup`, and
     `packages/cli/src/engine/tiers/tokens.ts`'s doc comment referencing
     `gpt-tokenizer` — both devDependencies declared at the *workspace
     root*, one level above the nearest match (`packages/cli/package.json`),
     which "nearest wins" never looks at once it finds a closer manifest.
     A tooling config relying on a root-level devDependency instead of
     repeating it in every package is completely normal, and it resolves
     at runtime: Node's bare-specifier resolution walks *every* ancestor
     `node_modules` up to the filesystem root, not only the closest one.
     "Nearest wins" modeled Node's resolution order backwards.

  Excluding pickcheck's own packages/ tree from this rule to make either
  round of false positives go away was rejected outright both times —
  that's exactly the "relax a rule to make ourselves pass" CLAUDE.md
  prohibits, and it would leave the rule broken for every other monorepo,
  not just this one. The actual fix: `declaredDependenciesForFile()`
  unions the declared-dependency sets of *every* manifest from the file's
  directory up to (and including) the scanned root, not just the nearest
  or only the root. Each directory's cumulative union is cached against
  its parent's, so a package with hundreds of files reads and parses each
  ancestor manifest once. A file whose full ancestor chain declares
  nothing at all (no manifest anywhere, or every manifest present
  declares no dependencies) is silently out of scope rather than flagging
  every bare specifier — "nothing to check against" isn't treated as a
  rule failure, but it also isn't treated as "everything is hallucinated."
- `scorer.ts`'s `isApplicable()` needed no change: a manifest rule is
  applicable exactly like a regex rule (its `files` glob matched something)
  — it already falls through to the generic branch.
- A manifest file that's missing or fails to parse is a warn-and-skip, not
  a crash, same error philosophy as every other tier.
