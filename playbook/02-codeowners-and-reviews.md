# 02 — CODEOWNERS and reviews

Code review at scale is not primarily a bug-finding exercise. It's how an
organization distributes knowledge, keeps a codebase stylistically
coherent, and produces an audit trail. Understanding which of those jobs
you still have alone is what decides which parts to keep.

## What review is actually for

Ask a large engineering org why every change needs an approval and you get
four different answers, all true at once:

- **Correctness.** The obvious one, and the weakest — reviewers catch
  design mistakes and missing cases far more reliably than they catch
  bugs, which is what tests are for.
- **Knowledge distribution.** After review, at least two people know the
  change exists. This is the reason review survives even on teams where
  the reviewer rarely finds anything.
- **Consistency.** A codebase that 200 people edit stays readable only if
  someone pushes back on divergence. Google formalizes this as its
  readability process, where a certified reviewer signs off on
  language-level style and idiom.
- **Control.** For SOC 2, ISO 27001 and SOX-style change management, "a
  person other than the author approved this change before it reached
  production" is a control that has to be *evidenced*. Branch protection
  plus review history is the evidence.

## How ownership is expressed

Nobody reviews everything. At 100+ developers, review authority is mapped
to paths:

- **`CODEOWNERS`** (GitHub, GitLab) or **`OWNERS`** files (Google,
  Chromium) map path globs to individuals or teams. GitHub's branch
  protection can then require an approval from the owning team before a PR
  touching those paths merges.
- Ownership is **per directory, not per repo**, and nested — an owner of
  `services/payments/` doesn't need to know anything about
  `services/search/`.
- Sensitive paths get **extra gates**: security review on auth and crypto,
  privacy review on anything touching user data, DBA review on migrations,
  an infra owner on CI configuration and deploy scripts. These are usually
  the same handful of directories where an unnoticed mistake is expensive
  rather than merely wrong.

The second-order effect matters more than the gate: a `CODEOWNERS` file is
the only machine-readable statement most codebases have of *where the
blast radius is*.

## Making review not be the bottleneck

Review latency, not review quality, is what large orgs fight. The
practices that work are unglamorous:

- **Small changes.** A reviewer's attention degrades sharply with diff
  size; a several-hundred-line PR gets a real review, a three-thousand-line
  one gets a rubber stamp. Big changes get split into a stack.
- **Everything mechanical moves to CI.** Formatting, lint, types, test
  coverage, dependency policy, license checks. A human should never be the
  thing that notices a missing semicolon — and shouldn't spend the review's
  credibility on it.
- **Explicit expectations.** A PR template converts tacit standards into
  prompts the author answers before a reviewer asks: what changed, how to
  verify it, what was checked.
- **Assignment and SLAs.** Round-robin assignment out of the owning team,
  with a stated response window, beats "whoever notices."

And the known failure mode: review does not catch what nobody reads.
Generated files, lockfiles, snapshots and vendored code get approved
unexamined, which is exactly why they're a favored place to hide things.

## The solo/AI-builder version

You have no second human, so you cannot get knowledge distribution or the
separation-of-duties control. You *can* keep the rest, and you need it
more than a team does — because your author is an assistant that writes
plausible code faster than you can read it.

- **Machine reviewers are the substitute.** Typecheck, lint, tests and
  `npx pickcheck audit --min <score>` as required checks give you an
  approver that never gets tired at midnight and never assumes you knew
  what you were doing. `pickcheck init` scaffolds
  [the workflow](../docs-kit/workflows/pickcheck.yml) with the gate baked
  in.
- **Never let the author review itself.** Asking the same assistant, in
  the same session, whether the code it just wrote is good gets you
  agreement, not review. If you want an AI review, open a fresh context
  and hand it the diff — not the conversation that produced it.
- **Read the diff, which means keeping the diff small.** The commit-first
  discipline from [01 — Branching](01-branching.md) exists to make this
  possible; a PR-sized change is a change you can still meaningfully read.
- **Use the checklist even though you wrote it.**
  [`docs-kit/PULL_REQUEST_TEMPLATE.md`](../docs-kit/PULL_REQUEST_TEMPLATE.md)
  is three questions — what changed, how to verify, what was checked. The
  point of a checklist is that it works when your judgment is tired.
- **Write `CODEOWNERS` anyway.** With one owner it blocks nothing, but it
  is still the file that names your dangerous paths — auth, payments,
  migrations, CI config, anything reading `process.env` — and it's the
  first thing a future collaborator inherits.
- **Automate the review comments a senior reviewer would have made.** A
  colleague would have noticed an import of a package nobody has heard of,
  a swallowed exception, or a key pasted into a source file. Alone, these
  are rules:
  [`sec/no-hallucinated-imports`](../packages/rules/security/no-hallucinated-imports/),
  [`qual/no-empty-catch`](../packages/rules/quality/no-empty-catch/),
  [`sec/no-secrets-in-code`](../packages/rules/security/no-secrets-in-code/),
  [`sec/no-env-in-git`](../packages/rules/security/no-env-in-git/). Each
  finding ships with a fix prompt, so the reviewer hands you the patch
  request rather than a complaint.
