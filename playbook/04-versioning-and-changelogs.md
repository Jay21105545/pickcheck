# 04 — Versioning and changelogs

A version number is a promise to whoever consumes your software; a
changelog is the explanation of what the promise costs them this time.
Everything organizations build around these two artifacts exists because
somebody has to decide whether upgrading is safe, and that somebody isn't
you.

## Semantic versioning is a contract, not a description of effort

[Semantic Versioning](https://semver.org) says the version communicates
compatibility: MAJOR when you break callers, MINOR when you add
backward-compatible capability, PATCH when you fix behavior without
changing the contract. The number describes impact on consumers, not how
much work the release was — a six-month rewrite with an unchanged public
API is a minor release, and a one-character change to a return type is a
major one.

The genuinely hard part is deciding what "the contract" covers. Hyrum's
Law — named for Hyrum Wright and discussed at length in *Software
Engineering at Google* — observes that with enough consumers, every
observable behavior of your system ends up depended on by somebody,
regardless of what you documented. Large organizations respond by making
the boundary explicit: a documented public API versus internals that carry
no promise, an `experimental`/`unstable` namespace, and a written
deprecation policy with a timeline attached.

## How releases are actually shipped

- **Deprecate before you remove.** A well-run major release removes only
  things that shipped a deprecation warning in an earlier minor. The
  removal is the last step of a process, not the first.
- **A major release is a migration guide with a version number on it.**
  The projects that do this well (React, Angular, Ember) ship codemods —
  automated migrations — alongside the breaking change, because the
  upgrade rate depends on the cost to the consumer, not on the merit of
  the change.
- **Release channels.** npm dist-tags (`latest`, `next`, `canary`), or
  stable/beta/nightly, let a project ship risky work continuously to
  people who opted in while `latest` stays boring.
- **Trains, not readiness.** Chrome, Firefox and Node ship on a calendar:
  a release is cut on schedule and anything not ready rides the next one.
  This removes "is it ready" from the release conversation entirely, and
  it's the reason those projects can promise dates at all. Node's LTS
  lines are the other half — a supported branch that receives backports
  long after development has moved on.
- **Internal services version differently.** Services that deploy
  continuously don't semver themselves; they version the *interface*
  (a path segment or header), keep N-1 compatibility so old and new
  instances can run simultaneously during a rollout, and migrate schemas
  in expand-migrate-contract steps rather than in one breaking deploy.

## Changelogs: two audiences

A changelog serves humans deciding whether to upgrade and machines
deciding what the next version number is. The two conventions that make
both work are [Keep a Changelog](https://keepachangelog.com) — a
human-written file with an `[Unreleased]` section at the top, grouped by
Added / Changed / Fixed / Removed — and
[Conventional Commits](https://www.conventionalcommits.org), which puts
enough structure in the commit subject for tooling to derive the grouping
and the bump.

The organizational trick worth stealing is *where the decision gets made*.
Tools like changesets, release-please and semantic-release move the
version decision to **PR time, by the author** — the person who actually
knows whether this breaks anyone — instead of release time, by a release
manager reading `git log` and guessing. A changelog generated at release
time from commit subjects is a list of commit subjects; it tells a
consumer what you did, not what it means for them.

The other half is that an unversioned deploy makes "which build has the
bug" unanswerable. Tagging every release, and putting the version
somewhere the running app reports it, is what makes an incident
investigation take minutes.

## The solo/AI-builder version

If anything but you consumes it — an npm package, a public API, another
one of your own repos — you owe it a version that means something. If it's
an app only you deploy, you still need a version and a changelog, for the
single question every incident starts with: *which build?*

- **The 20% is one file.** A `CHANGELOG.md` with an `[Unreleased]` section
  you append one line to *in the same commit as the change*. Writing it at
  release time is where changelogs die.
  [`docs-kit/CHANGELOG.md`](../docs-kit/CHANGELOG.md) is the Keep a
  Changelog skeleton, scaffolded by `npx pickcheck init`, and
  [`docs/changelog-exists`](../packages/rules/docs/changelog-exists/)
  scores whether you have one at all.
- **Conventional commits do the grouping for you.** They're free at commit
  time and they're the input to
  `npx pickcheck gen changelog`, which reads your real git history and
  writes a paste-ready prompt grouped by type — you edit the impact
  wording, your assistant does the transcription.
- **Tag every release, even a deploy of an app.** `git tag` costs nothing
  and is the only thing that makes "revert to what was running on
  Tuesday" a command rather than an investigation.
- **Watch for the AI-specific hazard: invented history.** Assistants will
  cheerfully rewrite a whole changelog file, renumber it, or fabricate
  entries for versions that never shipped, because a plausible-looking
  changelog is easy to generate and hard to distinguish from a real one.
  Keep edits append-only inside `[Unreleased]`, and read that part of the
  diff every time — it's four lines.
- **If you publish, let a tool own the bump.** changesets (used by this
  repo) makes you write the user-visible impact in the PR that causes it,
  then computes the version and assembles the release notes. That's the
  team practice that survives contact with one person.
- **Don't semver a thing nobody depends on.** A private app can sit at
  `0.x` forever. The ceremony is owed to consumers; where there are none,
  the changelog and the tag are the parts that still earn their keep.
