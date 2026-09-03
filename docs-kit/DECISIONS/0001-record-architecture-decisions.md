# ADR 0001 — Record architecture decisions

**Status:** accepted

## Context

We need a lightweight way to record the architecturally significant
decisions made on this project — the ones a new contributor would
otherwise have to reconstruct from git blame and chat history.

## Decision

We will keep decision records as numbered Markdown files in this
directory, one decision per file: context, options considered, the
decision, and its consequences. Superseding a decision means adding a
new file that says so, not editing the old one.

## Consequences

Decisions become searchable, reviewable in PRs like any other change, and
durable independent of who remembers the conversation. The cost is
discipline: a decision worth debating is worth writing down.
