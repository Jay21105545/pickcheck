# ADR 0031 — The release PR's CI gate is advisory, not enforced

**Status:** accepted · **Date:** 2026-09-06 · **Amended:** 2026-09-06

> **Amendment 1.** Decision 1's residual risk was originally stated as *"a
> skipped approval is invisible"*. The `0.3.0` release, which happened
> while this record was being written, showed the failure mode is not
> forgetting to approve — it is that approving does not block anything.
> Restated below, and branch protection promoted from noted alternative to
> the recommended next step.
>
> **Amendment 2.** The open item is closed. The repository setting that
> looked responsible was checked and ruled out; the cause is platform
> behaviour for `GITHUB_TOKEN`-authored PRs. Decision 2 is no longer a
> recommendation — branch protection is active on `main`, and its
> configuration is recorded below.

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

1. **The cause is platform behaviour, not repository configuration.**
   Settings → Actions → General was read on 2026-09-06. *"Approval for
   running fork pull request workflows from contributors"* is set to
   **"Require approval for first-time contributors who are new to
   GitHub"** — the least restrictive of the three options. **That setting
   is ruled out**: it governs *fork* PRs from *human* contributors, and
   `changeset-release/main` is a same-repository branch pushed by
   `github-actions[bot]`, which is neither. No other setting on that page
   gates workflow runs.

   What remains is GitHub's own handling of PRs authored with
   `secrets.GITHUB_TOKEN`, which exists to stop workflows triggering
   workflows recursively. This repository did not switch it on and cannot
   switch it off — a fact decision 3 leans on.

   **One thing this does not explain, and it is left open honestly:** a
   static platform rule does not account for the transition in the table.
   Runs on `0d7bf67` and `f5f98a1` executed unapproved; every run from
   `861ae20` onward parks. Same branch, same bot, same token, different
   outcome. Whether that was a platform rollout or something subtler is
   unresolved, and nothing in this repository records a change in that
   window. It is not worth further archaeology: every fix below is chosen
   against the *current* behaviour, and none of them depends on knowing why
   it changed.
2. **The signal is not decorative.** The only two runs that executed
   unapproved were both red. Losing a check that has never been green is
   not a theoretical loss.
3. **Nothing unverified has reached npm.** `861ae20` and `3669d7b` were
   each superseded by a force-push rather than merged. And the publish
   path is gated independently of the PR (see Context, "What is gated"),
   so even a release PR merged blind gets its tree checked before
   `changeset publish` runs. The exposure is a bad commit on `main`, not a
   bad release.
4. **The approval does not block the merge — observed, not hypothesised.**
   Publishing `0.3.0`:

   | Time (UTC) | Event |
   |---|---|
   | 20:31:35 | The parked run on `a580d14` is approved and starts |
   | 20:31:39 | **PR #3 is merged** — four seconds later |
   | 20:32:09 | That run goes green — thirty seconds *after* the merge |
   | 20:32:14 | `pickcheck@0.3.0` publishes |

   The check passed, and it passed too late to inform anything. Nothing in
   GitHub's UI or in this repository's configuration sequences the approval
   ahead of the merge button, so the two can be — and were — done in the
   same breath.

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

Its weakness, stated as observed rather than as imagined: **the approval is
non-blocking, so it can produce no gating signal at all.** The original
version of this record said the risk was a *skipped* approval going
unnoticed. That framing was too kind. On the `0.3.0` release the approval
was not skipped — it was given, and then raced: merged four seconds later,
green thirty seconds after the merge landed (Context, fact 4). A mitigation
that runs concurrently with the action it is supposed to gate is not a
mitigation, it is a receipt.

This is why decision 2 exists, and why decision 1 is now understood as *the
status quo being documented*, not as a control being relied upon.

### 2. Branch protection — adopted, active on `main`

**Require the `ci` status check on `main`.** This is the only one of the
three options that puts the check *before* the merge rather than beside it,
and it is the only one that needs no new credential, no new identity, and
no change to `release.yml`. The bot-authored PR still parks; the difference
is that the merge button stays disabled until someone approves the run and
it comes back green, which is exactly the ordering that was missing above.

**As configured on 2026-09-06**, ruleset `main` (id 22404084):

| Setting | Value |
|---|---|
| Enforcement | `active` |
| Bypass list | **empty** |
| Target | `~DEFAULT_BRANCH` |
| Rule | `required_status_checks` — context `ci`, GitHub Actions |
| Rule | `non_fast_forward` — force pushes to `main` blocked |
| Require branches up to date | off (`strict_required_status_checks_policy: false`) |

"Require branches up to date" is off deliberately: `changesets/action`
force-pushes the release branch on every push to `main`, and with the
strict policy on, each such push would invalidate the release PR's check
and park a fresh run needing another approval. That is churn, not safety.

**The stuck-release objection is answered by the owner being able to lift
the rule.** The original version of this record declined branch protection
partly because hard-blocking merges risked trading a silent gap for a stuck
release. That concern is real but it is not load-bearing: enforcement can
be set to disabled, so the worst case is a deliberate, logged act by the
owner, not a release that cannot ship. A gate you can consciously step over
when you must is strictly better than a gate that is always open.

**The override must be an action, not a standing exemption.** Adding a
repository admin to the ruleset's *bypass list* would also unblock a stuck
release, and it is the wrong way to do it: a bypass entry applies
automatically and silently, so on a repository whose only admin is also its
only committer it makes the rule advisory again — which is precisely the
failure this record exists to describe. Bypass list empty; disable the
ruleset when you genuinely must.

**The residual cost is real and is accepted: direct pushes to `main` are
now blocked.** A required status check applies to pushes, not only to
merges, and a freshly pushed commit has no check yet. With the bypass list
empty this binds the owner too — by design, per the paragraph above. Work
happens on a branch and lands through a PR; the three commits that produced
this record were the last that could have gone straight to `main`.

### 3. A GitHub App token is the longer-term structural fix — still deferred

Not adopted now. With decision 2 in place the manual approval is at least
load-bearing, which removes the urgency; this becomes worth doing when the
per-release click is the thing slowing releases down, rather than when the
gap is unsafe.

**Fact 1 strengthens this fix rather than weakening it.** While the cause
was believed to be a repository setting, the cheapest imaginable remedy was
to find that setting and change it — which would have made an App
unnecessary. Ruling the setting out removes that possibility: the parking
is platform behaviour attached to `GITHUB_TOKEN`-authored PRs, and it
cannot be configured away from inside this repository. Changing the
*author* of the PR is therefore not one option among several, it is the
only way to make the check run unattended. That raises this from a
convenience to the eventual correct fix.

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

### 4. `release.yml`'s comment stops overclaiming

The comment is rewritten to say what the gate does cover (every push to
`main`, the publishing merge included) and what it does not (the release PR
before that merge), and to point at this record. The original wording was
not false, but it invited a reader to conclude the release path is
end-to-end verified, and a comment that has to be read that carefully is a
comment doing harm.

## Consequences

- **The gap this record opened is closed.** A Version Packages PR can no
  longer be merged without a green `ci`, because the merge button is now
  bound by the ruleset rather than by the reviewer's diligence. `0.3.0`,
  released under the old regime, is the one release in this repository's
  history that shipped on a check that completed after its own merge.
- **`main` is now branch-only.** Direct pushes are blocked for everyone,
  the owner included, and force pushes are blocked outright by the
  `non_fast_forward` rule. Every change lands through a PR whose `ci` is
  green. `CONTRIBUTING.md` does not yet say this, and should.
- **Two of the three options are ordering fixes and one is an identity
  fix, and they compose.** Branch protection makes the check block the
  merge; the App token makes the check run without a human at all. Doing
  the first does not make the second unnecessary — it makes it the
  difference between one deliberate click per release and none.
- **The cause is settled; one loose end is documented, not chased.** The
  repository setting is ruled out and the behaviour is platform-side (fact
  1). What no explanation covers is why two early runs executed and every
  later one parks. That is recorded rather than resolved, because no fix
  here depends on it.
- **The release PR still needs one human click.** Branch protection orders
  the check before the merge; it does not make the check run. Until
  decision 3 lands, every release requires someone to approve the parked
  run — the difference is that forgetting now blocks the merge instead of
  silently permitting it.
- **CONTRIBUTING.md's release flow is unchanged and still correct.** Its
  step 3 already says merging the PR is what publishes; it simply never
  claimed the PR was tested, and now `release.yml` doesn't either.
