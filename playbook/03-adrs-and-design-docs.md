# 03 — ADRs and design docs

Two different artifacts, routinely confused. A design doc is written
*before* a decision, to surface objections while changing course is still
cheap. An architecture decision record is written *when the decision is
made*, so that nobody has to reconstruct the reasoning later. Large orgs
run both; solo builders usually skip both and pay for it within a month.

## Design docs: getting disagreement early

The practice large organizations converge on is a short document
circulated for comment before implementation begins. The public examples
are the easiest to study: Rust's RFC process, Python's PEPs, and the
Kubernetes enhancement proposals all put the proposal, the alternatives
and the objections in one reviewable artifact.

What makes it work isn't the format, it's the property that a document
collects asynchronous review. Ten people in four time zones can disagree
with a doc; they cannot all attend the meeting. And the objection that
costs an afternoon in a doc costs a quarter after the code is written.

A design doc that is doing its job contains: the problem and why it's
worth solving now, at least two options that were genuinely considered,
what each costs, and what has to be true for the choice to remain correct.
The last one is the part people skip and the part that ages best.

## ADRs: making a decision survive its author

The lightweight ADR comes from Michael Nygard's 2011 post "Documenting
Architecture Decisions", and the format has barely changed since, because
it's already minimal:

- **One file per decision**, numbered sequentially, stored in the repo.
- **Context** — what was true that forced a choice.
- **Options** — what else was on the table.
- **Decision** — what was chosen, stated plainly.
- **Consequences** — what this now costs, and what it forecloses.
- **Status** — proposed / accepted / superseded / deprecated.

Two conventions matter more than the template. First, ADRs are
**immutable**: you supersede a decision with a new record that says so,
you don't edit the old one, because the wrong reasoning is itself the
useful history. Second, they live **in the repo and get reviewed in the
same PR as the change**. Decisions kept in a wiki rot, because a wiki page
isn't in anybody's diff.

## When to write one

The practical test used in the field: write an ADR when the decision is
expensive to reverse, or when it constrains what other people can do
afterward. That's a short list — a dependency added, a data format, a
boundary between services, an auth model, a versioning policy, a rule the
codebase now has to keep obeying — and a long list of things that don't
qualify: a function's name, a refactor, anything that a later commit can
simply undo.

The failure modes are symmetric. Write ADRs for everything and they become
paperwork nobody reads; write them for nothing and every future change
starts with an archaeology dig through `git blame` and a chat history
somebody left the company with.

## The solo/AI-builder version

You are the future stranger. But there's a sharper reason ADRs pay for
themselves faster solo than on a team: **your assistant has no memory
across sessions.** A team's tacit knowledge is carried by people who were
there. Yours is carried by files in the repo, or not at all. An ADR is the
cheapest way to make a decision survive into next week's context window,
where it will be read by a model that is otherwise entirely willing to
undo it.

- **Write one when you'd otherwise have to explain the same thing twice** —
  to a collaborator, to yourself in three months, or to an assistant that
  keeps proposing the thing you already rejected.
- **Start the directory before you need it.** `npx pickcheck init` writes
  [`DECISIONS/0001-record-architecture-decisions.md`](../docs-kit/DECISIONS/0001-record-architecture-decisions.md),
  which is both the template and the first decision. Numbering that
  already exists is numbering you'll use.
- **Record the invariants an assistant would otherwise break.** This
  repo's own [`DECISIONS/`](../DECISIONS/) is the worked example: ADR 0002
  ("no LLM API calls inside the tool") is not a preference, it's a
  constraint that would be quietly violated by the next reasonable-looking
  suggestion if it existed only in someone's head. ADR 0024 records why
  the Node floor moved, so the question doesn't get reopened every time a
  dependency complains.
- **Keep the standing architecture doc separate from the deltas.**
  [`docs-kit/ARCHITECTURE.md`](../docs-kit/ARCHITECTURE.md) describes how
  the system fits together *now*; ADRs are the record of how it got that
  way. Both are scaffolded by `init`, and the docs axis of the audit
  checks that the durable ones exist at all
  ([`docs/api-doc-exists`](../packages/rules/docs/api-doc-exists/),
  [`docs/changelog-exists`](../packages/rules/docs/changelog-exists/)).
- **Point your context file at the decisions instead of restating them.**
  A `CLAUDE.md` that says "read `DECISIONS/` before changing the engine"
  stays small; one that inlines every decision grows until it's the
  dominant cost of every session — see
  [`tok/context-file-budget`](../packages/rules/tokens/context-file-budget/).
- **Four sentences is a legitimate ADR.** The ceremony was never the
  point; the durable, reviewable, superseded-not-edited record is.
