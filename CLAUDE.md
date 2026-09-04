# CLAUDE.md — pickcheck

You are working on **pickcheck**: a zero-config TypeScript CLI that audits
AI-built apps across six categories (security, quality, docs, discipline,
ui-ux, tokens) and emits fix prompts. Read instruction/IDEA.md for vision,
instruction/EXECUTION.md for the current phase, instruction/ARCHITECTURE.md
before touching the engine.

## Hard Constraints (never violate)

- **No LLM API calls in the tool.** Generators output prompt files only.
- **No network calls at runtime.** Everything local. No telemetry.
- **Node 22.12+ compatibility.** No Bun-only APIs. (Was Node 18+;
  raised in DECISIONS/0024 — commander@15 requires >=22.12 and both 18
  and 20 are past EOL.)
- **Rules are data.** Detection logic lives in `rule.yaml` (zod-validated);
  the engine never contains rule-specific code. If a rule needs new engine
  capability, add a new detection *tier*, not a special case.
- **Cold start matters.** No heavy deps in the CLI hot path. Lazy-load
  ast-grep and gpt-tokenizer only when their tiers run. Justify every new
  dependency in the PR description.
- **We pass our own audit.** If your change drops the self-audit score, fix
  the cause — never relax a rule to make ourselves pass.

## Conventions

- pnpm workspace: `packages/cli`, `packages/rules`, `packages/report`,
  `apps/docs`. Imports across packages go through workspace protocol.
- TypeScript strict mode. No `any` without an inline comment defending it.
- Biome for lint/format (`pnpm check`). Never hand-format against it.
- Conventional commits: `feat(cli): …`, `fix(rules): …`, `docs(playbook): …`.
- Every user-facing string lives in the renderer layer, not in engine code.
- Errors: never swallow. Engine failures on a single rule log a warning and
  continue the audit; they never crash the whole run.

## When Adding a Rule

1. Create `packages/rules/<category>/<rule-id>/` containing:
   - `rule.yaml` — id, category, severity (info|warn|error), tier
     (exists|regex|astgrep|tokens), pattern, message, docs link
   - `README.md` — why AI produces this mistake, what breaks in production,
     and a **fix prompt** the user can paste into their assistant
   - `fixtures/bad/` — minimal samples that MUST trigger
   - `fixtures/good/` — near-miss samples that MUST NOT trigger (this is the
     false-positive suite; it is mandatory)
2. Run `pnpm test` — the fixture harness auto-discovers the rule.
3. Run the corpus check if the rule is regex-tier: `pnpm corpus`.
4. Update the category weight table only via a decision record.

## When Changing the Engine

- Re-run the full corpus (`pnpm corpus`) and include the findings diff in
  your summary. An unexplained diff is a blocker.
- Snapshot tests for renderer output live in `packages/cli/test/render`.
  Update snapshots deliberately, never with a blind `-u`.

## Decision Records

Any architectural choice (new dep, new tier, scoring change, breaking CLI
flag) gets a file in `DECISIONS/NNNN-title.md` (context → options →
decision → consequences). Reference it in the PR.

## Definition of Done for Any Task

- Typecheck (`pnpm typecheck`), tests (`pnpm test`), lint (`pnpm check`) green
- Self-audit (`pnpm self-audit`) score unchanged or higher
- CHANGELOG entry via changeset if user-facing
- No TODOs left without a linked issue number
