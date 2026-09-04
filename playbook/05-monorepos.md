# 05 — Monorepos

The monorepo argument is usually had as a matter of taste. It isn't one.
A monorepo buys you one specific thing — atomic change across every
consumer — and charges you for it in tooling you would otherwise get free
from the ecosystem. Whether that's a good trade depends entirely on how
often you need to change two things at once.

## What large organizations actually get from it

Google, Meta and Microsoft run enormous single repositories, and the
reasons they give are consistent:

- **Atomic cross-project change.** Renaming an API and updating all 400
  callers is one commit that is either merged or not. In a polyrepo it's a
  coordinated program: publish, bump, wait, deprecate, chase stragglers.
- **One version of every dependency.** *Software Engineering at Google*
  calls this the One-Version Rule: the tree may not contain two versions
  of the same library. It sounds draconian and it's the whole point — it
  converts dependency upgrades from rare, catastrophic events into
  continuous, small ones, and it makes diamond dependency conflicts
  structurally impossible.
- **One build graph and uniform tooling.** Every target is described the
  same way, so test selection, CI, and large-scale automated refactoring
  can be built once.

What they pay is infrastructure. Google's Piper and Blaze/Bazel, Meta's
Buck and Sapling, Microsoft's GVFS/Scalar work on the Windows repo — these
exist because ordinary Git and ordinary build tools do not survive at that
size. That's the real cost line: a monorepo at scale requires a build
system that knows the dependency graph, caches aggressively, and only
tests what a change can affect. Without it, every commit runs everything.

## What a monorepo does not remove

Polyrepo isn't the absence of these problems, it's their relocation. Split
repositories trade atomic refactors for version negotiation, dependency
bumps and integration lag — and they hide the lag, which is worse, because
the breakage surfaces weeks later in someone else's build.

The pieces that a shared trunk makes mandatory are covered in the earlier
chapters: path-scoped ownership so nobody reviews everything
([02](02-codeowners-and-reviews.md)), and a merge queue because everyone
lands on the same branch ([01](01-branching.md)).

## The JavaScript-specific shape

In the npm ecosystem the entry price is much lower — pnpm, npm and Yarn
workspaces give you a package graph, and Nx or Turborepo add caching and
affected-target selection when you need them. But the ecosystem adds a
failure mode the big-iron monorepos don't have: **the workspace resolves
things the registry won't.**

A package can import a sibling by name, build fine, pass every test, and
be completely broken when installed from npm — because the sibling was
private, or because pnpm's `workspace:^` protocol reached the registry
verbatim, where npm has no idea what it means. Everything inside the
workspace agrees with you; only a real consumer disagrees.

## This repo as the worked example

pickcheck is a pnpm workspace — `packages/*`, `apps/*` and `corpus`, per
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) — split along one axis:
what gets published, and what is content.

| Package | Published | Why it's separate |
|---|---|---|
| `packages/cli` | yes, as `pickcheck` | the only artifact a user installs |
| `packages/rules` | no | *content*: `rule.yaml` + fixtures, no engine code, so contributing a rule needs no engine knowledge ([ADR 0001](../DECISIONS/0001-rules-as-data.md)) |
| `packages/report` | no | the self-contained HTML report template |
| `apps/docs` | no | the docs site |
| `corpus` | no | the backtest harness |

And the trap above is not hypothetical here: `pickcheck@0.1.0` shipped
**completely uninstallable** — `workspace:^` in the published
`package.json` — while every source-level check was green. The fix wasn't
a lint rule, it was a test that asserts against the real built artifact in
`dist/`, plus a CI ordering where `build` runs before `test` so that guard
has something to inspect ([ADR 0021](../DECISIONS/0021-publishable-artifact-integrity.md)).

## The solo/AI-builder version

Default to one repo with one package. Not a monorepo — a repo. Workspace
splitting is a boundary-enforcement tool, and boundaries you don't have
yet cost more to maintain than they save.

- **Split only when there's a boundary you want the build to enforce** — a
  published artifact versus internal content, or a second real consumer.
  "It feels tidier" isn't a boundary; a directory would have done.
- **If you do split, buy the packaging guard on day one.** Write one test
  that installs or inspects the *built* package, not the source. Workspace
  resolution and AI assistants fail the same way here: both make the code
  look correct in the only environment you're looking at.
- **Keep one AI context file at the root, and keep it small.** The
  characteristic monorepo failure is a `CLAUDE.md` per package, each a
  drifting copy of the others — every assistant session then pays for the
  same guidance two or three times, and the copies disagree within a
  month. That's exactly what
  [`tok/context-duplication`](../packages/rules/tokens/context-duplication/)
  and
  [`tok/context-file-budget`](../packages/rules/tokens/context-file-budget/)
  measure.
- **Audit from the root and exclude what isn't product code.**
  `npx pickcheck audit` scans the whole tree from where you run it;
  fixtures, demo apps and vendored samples belong in `.pickcheckignore`
  ([this repo's](../.pickcheckignore) excludes its deliberately-broken
  example app and its audit-input fixtures, with the reasoning inline).
- **Document the layout once, in [`ARCHITECTURE.md`](../docs-kit/ARCHITECTURE.md).**
  In a single-package repo the structure is discoverable; in a workspace
  it isn't, and neither you nor an assistant should be re-deriving which
  package may import which from `package.json` files at 1am.
