# ADR 0020 — `quality` is its own scored category, split from `discipline`

**Status:** accepted (retroactive — recording a decision already implemented) · **Date:** 2026-09-03

## Context

IDEA.md's original pitch (and DESIGN.md, ARCHITECTURE.md's monorepo-layout
comment, EXECUTION.md's Phase 3 acceptance line, and this repo's own root
CLAUDE.md) all described **five** score axes: security, docs, discipline,
ui-ux, tokens. But RULESET.md — the Phase 1 spec for the first ten rules,
written before any of the scoring ADRs — already used a `qual/` id prefix
distinct from `disc/` for two of them (`qual/no-empty-catch`,
`qual/fetch-has-error-handling`), and its own "Category Weights" table
already lists **six**: `security .30 · quality .20 · docs .15 ·
discipline .15 · ui-ux .10 · tokens .10`. [ADR 0004](0004-scoring-normalization.md)
then hard-codes that same six-entry `CATEGORY_WEIGHTS` into the actual
scorer (`packages/cli/src/engine/scorer.ts`) while implementing the
"applicable" denominator question — carried forward unchanged by ADR 0006
and ADR 0009 since. So `quality` has been a real, distinct, consistently-
weighted category since the ruleset was first specified; it was simply
never reconciled back into the higher-level vision docs, which kept
saying "five" for sixteen decision records' worth of drift. This ADR is
that reconciliation, plus the missing "why," written down for the first
time.

## Why `quality` isn't `discipline`

`discipline` catches *visible, superficial* process signals —
`console.log` left in application code today, and (per IDEA.md's original
framing) commit hygiene, versioning, and dead code as the category grows.
These are unprofessional, but they don't corrupt program behavior; a repo
full of stray `console.log`s still does what it's supposed to do.

`quality` catches *silent correctness failures* — an empty `catch` block
or a `fetch()` with no error handling doesn't just look sloppy, it means
a real failure occurs at runtime and nothing observes it: no log line, no
user-visible error, no stack trace. `qual/no-empty-catch`'s own README
calls this "the signature AI-generated-code smell" precisely because it's
strictly worse than no error handling at all — a bare, unwrapped call
would at least crash loudly.

That's a difference in kind, not just topic — cosmetic hygiene vs. bugs
actively hidden from whoever has to debug them later — and it's why they
carry different weights (`quality` .20, `discipline` .15) rather than
being one category with an averaged-out severity. Folding `quality`'s
findings into `discipline` would either drag a materially worse failure
mode down to a cosmetic-severity weight, or drag `discipline`'s weight up
to cover problems it was never meant to represent.

## Decision

`quality` stays a permanent, independent top-level category — canonical
order `security, quality, docs, discipline, ui-ux, tokens` (matching
`CATEGORY_WEIGHTS`' key order in `scorer.ts`, `terminal.ts`'s
`CATEGORY_ORDER`, and `packages/report`'s radar chart axis order), weight
`0.20`. Current rules: `qual/no-empty-catch` (error), `qual/fetch-has-
error-handling` (warn).

Every instruction doc that stated a category count is corrected in this
same change to say **six**, not five: `instruction/IDEA.md` (the one-line
pitch and "The Six Categories" section, adding `quality` between
`security` and `docs` to match canonical order), `instruction/DESIGN.md`
(terminal mini-bar count, radar axis count), `instruction/ARCHITECTURE.md`
(the monorepo-layout category-directory listing, the `rule.yaml` example's
category-enum comment, and a pointer to this ADR next to the weight
table), `instruction/EXECUTION.md` (Phase 3's acceptance line), this
repo's root `CLAUDE.md`, and `examples/broken-app/README.md` (which
undercounted its own demo repo's findings — the flat bullet list at the
top already spans `security`, `quality`, and `discipline` together).

## Consequences

- No code changes: every consumer of "how many categories" (the radar
  chart's axis count, the terminal renderer's mini-bar count, the report's
  category legend) already derives its count from `CATEGORY_WEIGHTS`'
  actual keys, never a hardcoded `5` — this was purely a documentation
  staleness fix, confirmed by reading `scorer.ts` directly rather than
  assuming the docs were right.
- `instruction/ARCHITECTURE.md`'s Scoring section's weight table
  (`security .30, quality .20, docs .15, discipline .15, ui-ux .10,
  tokens .10`) already matched `CATEGORY_WEIGHTS` exactly before this ADR
  — confirmed by direct comparison, not assumption. It needed a citation
  to this record, not a numbers fix.
- A future new category should update `RULESET.md` (or its successor) and
  the same set of instruction docs listed above *in the same PR* that adds
  the category's first rule — this exact drift (a spec-level doc having
  the truth for sixteen ADRs while the pitch docs quietly went stale) is
  what this record exists to prevent from recurring silently again.
