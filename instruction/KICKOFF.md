# pickcheck — CLAUDE CODE KICKOFF

How to drive the build. Put all these .md files in the repo root, then run
sessions in this order. One session = one phase-slice; keep sessions scoped
so context stays sharp (we practice our own token category).

## Session 1 — Bootstrap
> Read CLAUDE.md, EXECUTION.md, ARCHITECTURE.md. Execute Phase 0: create the
> pnpm workspace exactly per ARCHITECTURE.md layout, configure tsdown, tsx,
> biome, vitest, strict tsconfig, and CI (typecheck + test + check). Add
> CHANGELOG.md (Keep a Changelog), copy DECISIONS/ in. Acceptance: pnpm build
> yields a runnable `pickcheck --version`. Use conventional commits.

## Session 2 — Engine
> Read ARCHITECTURE.md engine section. Build the pipeline: glob scan
> (.gitignore-aware), zod rule loader (invalid rule → warn + skip, never
> crash), tier dispatch for exists + regex (stub astgrep + tokens), scorer
> with the weight table, findings model, --json renderer, exit-code gate.
> Add renderer snapshot tests. No rules yet — engine only, fully tested.

## Session 3 — First rules wave
> Read RULESET.md. Implement rules 1–2 and 4–7 (exists + regex tiers) as
> rule folders with rule.yaml, README (incl. fix prompt), fixtures/bad,
> fixtures/good. Build the vitest fixture harness that auto-discovers every
> rule and asserts both directions. All green.

## Session 4 — ast-grep tier + structural rules
> Add the astgrep tier (lazy-load @ast-grep/napi). Implement rules 7→astgrep
> upgrade, 8, 9 per RULESET.md, plus rule 3 (manifest-aware imports) and 10
> (regex v1). Adversarial fixtures: secrets in template strings, empty catch
> with comment, commented-out code.

## Session 5 — Terminal renderer + self-audit
> Read DESIGN.md terminal section. Build the terminal renderer: summary card,
> category groups, severity glyphs, score bars, NO_COLOR support. Then add
> `pnpm self-audit` and wire it into CI as a required check with --min 90.
> Fix anything our own audit flags. Do not weaken rules to pass.

## Session 6 — init + generators
> Execute Phase 2 per EXECUTION.md: clack-driven init with stack detection
> and docs-kit scaffolding; gen api and gen changelog emitting
> pickcheck-prompt.md from real code / git log. Acceptance test: fresh
> Next.js starter, init then audit, score +25 minimum.

## Later sessions
Phase 3 (ui-ux + tokens), Phase 4 (HTML report per DESIGN.md, playbook
chapters), Phase 5 (corpus backtest + launch) — each scoped the same way:
read the relevant .md, execute one slice, meet acceptance, commit clean.

## Standing Instructions for Every Session
- End with: typecheck, test, check, self-audit all green; changeset if
  user-facing; summary of corpus/findings diffs if engine touched.
- If a task needs a decision not covered by the docs, write a DECISIONS/
  draft and stop for review instead of guessing.

## File Placement in the Repo
```
repo root: CLAUDE.md  IDEA.md  EXECUTION.md  ARCHITECTURE.md  DESIGN.md
           RULESET.md  KICKOFF.md  DECISIONS/0001…  DECISIONS/0002…
```
