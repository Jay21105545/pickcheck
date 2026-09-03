# ADR 0013 — AI-context-surface token report is unscored, computed outside the rules pipeline

**Status:** accepted · **Date:** 2026-09-03

## Context
IDEA.md and EXECUTION.md's Phase 3 both ask for the audit to "report total
AI-context-surface token count and estimated waste %" — a headline stat
(how many tokens does this repo's CLAUDE.md/AGENTS.md/etc. cost every AI
session, and how much of that is duplicated content), not a pass/fail
finding. Two ways this could plug into the existing pipeline were
considered, both rejected before landing on a third:

1. **A `tokens`-category rule that always fires an `info` finding**
   carrying the totals. Rejected: `scoreFindings()` (DECISIONS/0009) has
   no notion of a finding that isn't a problem — an always-on finding
   permanently costs the `tokens` category a small fixed penalty on
   *every* audited repo, including one with a single lean CLAUDE.md and
   zero duplication. That directly contradicts ADR 0009's "a category
   with zero findings still reports 100" and would make a clean repo's
   tokens score never actually reach 100.
2. **Extend `TierResult` with an optional stats/meta field** so a tier can
   report supplementary numbers alongside `findings`/`warnings`.
   Rejected: `TierResult` is deliberately uniform across all five tiers;
   adding a tokens-specific payload to a shared interface leaks one
   tier's concern into a type every other tier has to keep ignoring, for
   a feature that has nothing to do with dispatching findings.
3. **A standalone, unscored computation** (`engine/token-surface.ts`),
   invoked directly by `runAudit()` alongside (not through) rule
   dispatch, returning `AuditResult.tokenSurface: TokenSurfaceReport |
   undefined` — rendered by the terminal/JSON renderers, never fed into
   `scoreFindings()`.

## Decision
Option 3. `computeTokenSurface(cwd, scannedFiles)` globs a fixed list of
conventional AI-context filenames (`CONTEXT_FILE_GLOBS` —
CLAUDE.md/AGENTS.md/.cursorrules/.windsurfrules/.clinerules/Cursor's
`.cursor/rules/**/*.mdc`/Copilot's `.github/copilot-instructions.md`),
lazy-loads `gpt-tokenizer` (returns `undefined`, not an error, if that
fails — "never crash the audit" applies to a report the same as a tier),
counts tokens per matched file, and estimates waste as the token cost of
every duplicated paragraph found by the *same*
`findDuplicateParagraphs()` the `tok/context-duplication` rule uses
(`engine/text-duplication.ts` — shared, not reimplemented, so the two
don't quietly diverge on what counts as "duplicated"). `runAudit()` calls
it independently of the rule-dispatch loop; `AuditResult.tokenSurface` is
`undefined` when no context files exist, and the terminal/JSON renderers
both treat that as "omit the section entirely," not a zero-value block.

**Why the context-file glob list lives here, not in `tok/*` rule.yaml
data:** CLAUDE.md's "rules are data, the engine never contains rule-
specific code" governs *scored detection logic* — what counts as a
finding, and how severely. This is a report: a stat about the repo, with
no severity, no category penalty, nothing a rule contributor tunes via
fixtures. Deriving it from a specific rule's `files` field (e.g.
`tok/context-file-budget`) would couple a report to one rule's identity
by id — a different, and arguably worse, coupling than a small constant
list living next to the report that reads it. Both this report's list and
each `tok/*` rule's own `files` cover the same conventional filenames
today; nothing enforces they can't drift, since they answer different
questions ("what should I count tokens across" vs. "what should I flag as
over budget/duplicated/uncovered") that happen to currently coincide.

## Consequences
- `AuditResult` gains a `tokenSurface: TokenSurfaceReport | undefined`
  field; `toJsonReport()` passes it through; `renderTerminal()` prints an
  "AI context surface: N tokens across M files · est. W% waste" block
  (with a per-file breakdown) directly under the summary card, only when
  defined.
- The report can never move a `composite` or category score — a repo's
  token-surface size and waste % are informational only, exactly the
  budget/duplication/coverage *rules* (ADR 0012) are what score it.
- Known limit, stated in the terminal output's own wording ("estimated"):
  waste % is one heuristic (verbatim-paragraph duplication, ≥200 chars)
  applied to whatever `gpt-tokenizer` happens to load — it is a repo-
  comparable estimate of duplication cost, not an exact "tokens you could
  delete" figure.
