# ADR 0031 — The release PR's CI gate is advisory, not enforced

**Status:** accepted · **Date:** 2026-09-06

## Context

`release.yml` carries this comment above its five gate steps:

> Same gate CONTRIBUTING.md asks of every PR — a release workflow
> publishing without it would be a weaker guarantee than a human PR.

That claim is true of the path it annotates and false of the one a reader
infers from it, and the difference is where the gap lives.

**What is gated.** The five steps run on every push to `main`, and the
merge of a Version Packages PR *is* a push to `main`. So the publish path
is genuinely gated: `changeset publish` runs only after typecheck, build,
test, check and self-audit have passed on the merged tree. Nothing reaches
npm ungated, and ADR 0021's hand-published breakage cannot recur this way.

**What is not gated.** The Version Packages PR *itself*, in the window
between the bot opening it and a human merging it. `changesets/action`
authors that PR as `github-actions[bot]` using `secrets.GITHUB_TOKEN`, and
`ci.yml`'s `pull_request` runs for a bot-authored PR land in
`action_required`: the run is created, and executes nothing, until someone
clicks **Approve and run**.

Every CI run on `changeset-release/main` to date:

| PR head | Run opened | Conclusion | Jobs run | Wall time |
|---|---|---|---|---|
| `0d7bf67` | 2026-09-04 09:53 | failure | yes | 2m 03s |
| `f5f98a1` | 2026-09-05 07:23 | failure | yes | 6m 26s |
| `861ae20` | 2026-09-05 09:12 | `action_required` | **none** | 0s |
| `3669d7b` | 2026-09-05 22:36 | `action_required` | **none** | 0s |
| `a580d14` | 2026-09-06 20:28 | `action_required` → success | yes, on attempt 2 | 29s |

Three facts in that table are load-bearing:

1. **The parking started partway through.** Before 2026-09-05 07:23,
   bot-triggered runs executed normally; from 09:12 that same morning they
   park. Something in the repository's Actions settings changed inside that
   two-hour window. **The specific setting has not been identified** — it is
   not recorded in this repo, and the two parked runs carry no approver.
   Whoever next touches Settings → Actions → General should record what they
   find there against this ADR.
2. **The signal is not decorative.** The only two runs that executed
   unapproved were both red. Losing a check that has never been green is
   not a theoretical loss.
3. **Nothing unverified has shipped.** `861ae20` and `3669d7b` were each
   superseded by a force-push rather than merged, so no untested tree
   reached `main`. The mechanism permitted it; luck and cadence prevented
   it.

## Decision

### 1. Manual "Approve and run" is the current mitigation

Before merging a Version Packages PR: open its checks, approve the pending
run, and require it green. This is documented convention, not enforcement.

It works — `a580d14` was approved on attempt 2 and the full gate passed,
all five steps, in 29 seconds. It is accepted as sufficient *for now* on
three grounds: release cadence is low; merging the PR is already a
deliberate human act that this rides along with; and the publish itself
stays gated regardless, so the worst case is a bad commit on `main` that
fails the gate and does not publish, rather than a bad release.

Its weakness is stated plainly: **a skipped approval is invisible.** A PR
with no checks and a PR whose checks are still queued look alike at a
glance, and the reviewer is the only thing standing between the two.

### 2. A GitHub App token is the structural fix — deferred

Not adopted now; adopted when release frequency makes step 1's reliability
the binding constraint rather than its inconvenience.

The mechanism: a GitHub App scoped to this repository with `contents:
write` and `pull_requests: write`, an installation token minted per run via
`actions/create-github-app-token`, and that token passed to
`changesets/action` in place of `secrets.GITHUB_TOKEN`. A PR authored by an
App installation is not subject to the bot-PR approval gate, so `ci.yml`
runs on it the way it runs on a human PR.

**Explicitly not a PAT.** A fine-grained or classic personal access token
would solve the same problem and is the more commonly suggested fix, and it
is rejected on credential lifetime: a PAT is a long-lived bearer token
sitting in repository secrets, bound to one person's account, carrying at
least this much authority for as long as nobody rotates it, and outliving
that person's involvement in the project. An App installation token is
minted per workflow run, expires in an hour, and is scoped to the
installation rather than to a human. For a credential whose whole job is to
open a PR, an hour of validity is the correct amount.

The cost of deferring is one manual click per release, and the cost of
adopting is an App to create, register and own — which is why cadence is
the trigger.

### 3. `release.yml`'s comment stops overclaiming

The comment is rewritten to say what the gate does cover (every push to
`main`, the publishing merge included) and what it does not (the release PR
before that merge), and to point at this record. The original wording was
not false, but it invited a reader to conclude the release path is
end-to-end verified, and a comment that has to be read that carefully is a
comment doing harm.

## Consequences

- **A Version Packages PR can still be merged with no CI signal at all.**
  The reviewer is the only control. This is the accepted residual risk of
  decision 1, and it is the thing decision 2 exists to remove.
- **Branch protection is the cheaper half-step, and is not taken here.**
  Requiring the `ci` check on `main` would convert convention into
  enforcement without any new credential — but it makes the same human
  approval mandatory rather than optional, blocking the merge until someone
  clicks. That is a real improvement over convention and it is noted as the
  first thing to reach for if the manual mitigation proves unreliable in
  practice. It is not adopted now only because it hard-blocks releases on a
  setting whose origin is still unidentified (see fact 1); doing that before
  understanding why runs park risks trading a silent gap for a stuck
  release.
- **The unidentified setting is an open item.** Until someone reads the
  repository's Actions settings, this ADR describes a behaviour without its
  cause, and the fix in decision 2 is chosen against a mechanism inferred
  from the run history rather than confirmed at its source.
- **CONTRIBUTING.md's release flow is unchanged and still correct.** Its
  step 3 already says merging the PR is what publishes; it simply never
  claimed the PR was tested, and now `release.yml` doesn't either.
