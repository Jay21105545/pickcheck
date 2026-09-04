# ADR 0026 — Resolve manifests above the scan root, bounded by project roots

**Status:** accepted · **Date:** 2026-09-04

**Extends** [ADR 0007](0007-manifest-tier.md)'s ancestor-union
dependency resolution and [ADR 0015](0015-manifest-tier-false-positive-fixes.md)'s
false-positive work.

## Context

```
$ cd packages/cli && pickcheck audit
sec/no-hallucinated-imports  tsup.config.ts:1
```

`tsup.config.ts` line 1 is `import { defineConfig } from "tsup"`. `tsup`
is real, installed, and resolves at runtime — it is a devDependency of
the **monorepo root**, and Node's resolver walks `packages/cli/
node_modules` → `packages/node_modules` → `<root>/node_modules` to find
it. ADR 0007 already established that this is the resolution the manifest
tier must imitate, and it does — but only *up to the scan root*. Audit
the repo from `/`, and the root manifest is inside the walk. Audit it
from `packages/cli`, and the walk bottoms out one directory below the
manifest that declares the dependency, so a real import reads as a
hallucinated one.

Auditing a subdirectory is not exotic. It is what anyone with a monorepo
does when they want a score for one package. Our own self-audit never
caught it because it only ever runs from the repo root — the one place
where the bug is invisible.

## Options

1. **Leave it; tell users to audit from the repo root.** Rejected: the
   tool is meant to be zero-config, and the finding it produces is a
   confident, `error`-severity accusation that a real package is
   imaginary. A false positive of that shape costs more trust than the
   rule earns.
2. **Walk to the filesystem root, unbounded.** Rejected: it would let
   `~/package.json` — or anything else that happens to sit above a
   checkout — vouch for a repo's imports. "Declared somewhere on this
   machine" is not the question the rule asks, and the result would vary
   with where the user keeps their code.
3. **Walk exactly one level above the scan root.** Rejected as a guess:
   it happens to fix `packages/cli` and happens not to fix
   `apps/web/frontend`. There's no principle in "one".
4. **Walk above the scan root, bounded by project roots.** Chosen.

## Decision

The ancestor walk continues above the scan root, bounded at both ends:

- **It doesn't start** if the scan root is itself a project root.
  Auditing a whole repo already sees every manifest that governs it;
  climbing out of a checkout is exactly option 2's failure.
- **It stops, inclusively, at the first project root above.** That
  root's manifest is the workspace-root `package.json` this exists to
  find, so it is read before stopping. Anything past it belongs to a
  different project.
- **It contributes nothing if no project root is found.** Reaching the
  filesystem root without one means the scanned directory isn't enclosed
  by any project we can identify, so there is no principled boundary.
  Whatever was collected is discarded, and the tier behaves exactly as it
  did before this walk existed.

A **project root** is a directory carrying any of: `.git` (matched as a
path, not a directory — worktrees and submodules write it as a file
holding a gitdir pointer), `pnpm-workspace.yaml`, or a `package.json`
with a `workspaces` field (npm's and yarn's equivalent). Together those
cover how the ecosystem actually declares one.

Only manifests are read above the scan root. No file up there is
scanned, and no finding can ever be reported against one.

This is engine capability, not rule-specific code (CLAUDE.md): both
`manifest`-tier modes go through the same resolution, so
`requires-dependency` inherits it too — a payment SDK declared at a
workspace root is just as installed as one declared next door, and
auditing a single package must not resurrect that finding either.

## Consequences

- `cd packages/cli && pickcheck audit` goes from composite **59 with 1
  finding** to **100 with 0 findings**. The finding it lost was false.
- **Corpus: no diff.** All eight repos are audited at their own root,
  which is a `.git` project root, so the walk never starts — the new code
  is inert for every one of them. Composites and findings are byte-identical
  to the committed snapshots.
- Self-audit from the repo root is likewise unchanged (100, 0 findings):
  same reason.
- The walk costs at most one `stat` per marker and one manifest read per
  directory between the scan root and the enclosing project root,
  memoised once per run — not per file.
- **One direction can add findings**, and it is the intended one:
  `hallucinated-import` skips a file whose declared-dependency set is
  empty, because there is nothing to cross-reference it against. A
  package with an empty (or absent) manifest of its own, inside a
  workspace whose root declares dependencies, now has a non-empty set and
  so gets checked instead of skipped. That is the rule doing its job on a
  file it previously had no basis to judge, not a loosened bound. No
  corpus repo is in that shape.
- `.pickcheckignore` gains `packages/cli/test/fixtures/`. The fixture
  added here contains a deliberately hallucinated import as its positive
  control, and scoring ourselves on audit *input* is the same category
  error `examples/broken-app` is already excluded for (ADR 0006). This
  relaxes no rule and changes no score: those directories contribute zero
  findings today, measured before and after.
- A directory audited from outside any identifiable project still gets
  the old behaviour. That is the conservative failure, and it is
  observable rather than silent — the tier simply finds nothing to
  cross-reference against and stays quiet, as it always has for a tree
  with no manifest.
