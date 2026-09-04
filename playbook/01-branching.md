# 01 — Branching

How a few hundred people commit to one codebase without it coming apart —
and which parts of that still matter when the "organization" is you and an
assistant.

## The problem a branching model solves

Branching is not about tidiness. It answers one question: how long can a
change stay separated from everyone else's work before merging it becomes
a project of its own? Every branch is a bet that the code it forked from
won't move much. The longer it lives, the worse the bet — and the cost
isn't linear, because the conflicts that hurt aren't textual. Two people
can edit different files and still break each other.

## The two families

**Release-branch models.** Git Flow — Vincent Driessen's 2010 post "A
successful Git branching model" — is the canonical write-up: long-lived
`develop`, plus `release/*`, `hotfix/*` and `feature/*` branches around
`main`. It fits software where several versions are alive in the field at
once: installed software, SDKs, firmware, mobile apps behind store review.
Driessen later added a note to that post saying as much, pointing readers
building continuously-delivered web apps at simpler models.

**Trunk-based models.** Everyone integrates into `main` continuously —
branches measured in hours, incomplete work hidden behind feature flags
rather than kept on a branch, releases cut from trunk. Google's DORA
research program has consistently associated trunk-based development and
short-lived branches with higher software delivery performance.

Most large web organizations run trunk-based with a thin release-branch
layer: `main` for development, a `release-*` branch cut per train, fixes
cherry-picked onto it.

## What actually gets enforced

The diagram is the least interesting part. What a 100+ dev org enforces is
a set of invariants, and the tooling exists to make them non-negotiable:

1. **`main` is always releasable.** Not "usually green" — releasable, at
   every commit, because someone is always about to cut from it.
2. **Nobody pushes to `main` directly.** Branch protection requires status
   checks, at least one review from someone other than the author, and
   forbids force-pushes. Often linear history, so `git bisect` and revert
   stay meaningful.
3. **Branches are short.** Hours to a couple of days. Anything longer gets
   split, or goes behind a flag and merges half-finished.
4. **Deploy is decoupled from release.** Feature flags are what make (3)
   possible: unfinished code ships dark and is turned on separately. This
   is the single practice that lets trunk-based development work on
   features that take a month.
5. **A merge queue guards the semantic conflict.** Two PRs, each green
   against `main`, broken when both land — one renames a function, the
   other adds a caller. A merge queue (GitHub's, Rust's bors, Uber's
   SubmitQueue) re-tests each change against the state it will actually
   merge into, serially, and kicks out the one that fails.
6. **Fixes land on `main` first, then get cherry-picked onto the release
   branch.** Never the reverse. Fixing only on the release branch is how a
   bug you already fixed reappears in the next version.
7. **Branch and commit names carry the ticket id**, because that's what
   links a production incident back to a decision six months later.

## The cost nobody mentions

Branch protection is only survivable if CI is fast. Requiring green checks
on every merge turns test suite duration into org-wide latency, which is
why large teams pour real effort into test sharding, caching, flaky-test
quarantine and batching in the merge queue. A team that adds the gate
without paying for the speed just moves the bottleneck onto its engineers.

## The solo/AI-builder version

You don't have merge conflicts with other humans. You have a different
problem: an assistant that can rewrite forty files between two of your
keystrokes, and `git diff` as your only review surface.

- **One branch: `main`.** Trunk-based is what solo work already is. Cut a
  branch only for a change that's genuinely risky or that you might
  abandon, and delete it when it merges.
- **Commit before you hand the repo to an assistant.** The commit isn't a
  save point for the code, it's a save point for the *diff* — it's what
  makes the next hour of generated changes reviewable at all, and what
  makes `git restore` a real undo instead of a guess.
- **Protect `main` from yourself.** `npx pickcheck init` writes
  [`.github/workflows/pickcheck.yml`](../docs-kit/workflows/pickcheck.yml),
  a CI gate that fails the build when the audit score drops below your
  threshold; turn on required status checks in the repo settings so it
  actually blocks. A machine gate is the substitute for the reviewer you
  don't have — see [02 — CODEOWNERS and reviews](02-codeowners-and-reviews.md).
- **Never let a branch outlive your memory of it.** It also outlives the
  assistant's: when a session ends, nothing anywhere knows what was
  half-finished on that branch except you.
- **Tag every release; cherry-pick from tags if you must.** That is the
  entire release-branch practice, scaled to one person. You don't need a
  `release/*` branch until you're supporting a version you're no longer
  developing.
- **Use conventional commits from commit #1.** They cost nothing at the
  time and are the input to `npx pickcheck gen changelog` later — see
  [04 — Versioning and changelogs](04-versioning-and-changelogs.md).
