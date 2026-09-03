# ADR 0010 — @clack/prompts for `pickcheck init`

**Status:** accepted · **Date:** 2026-09-03

## Context

Phase 2 (`instruction/EXECUTION.md`) adds `pickcheck init`, an interactive
scaffolding flow that asks a handful of questions (which AI assistant
conventions file to write, the CI gate's minimum score) before writing
files into the target repo. `instruction/EXECUTION.md`'s locked tech-stack
table already named `@clack/prompts` for this ("modern create-* UX"), but
it wasn't yet a dependency of any package — this ADR is the record CLAUDE.md
requires before adding it.

## Decision

Add `@clack/prompts` (`^1.7.0`) as a dependency of `@pickcheck/cli`, used
only by the `init` command.

- **Lazy-loaded**: `commands/init.ts` imports it with a dynamic `import()`
  inside the action handler, only on the interactive path (not when `--yes`
  is passed or stdin isn't a TTY). `audit` and `gen` never pay its load
  cost — same pattern already used for `@ast-grep/napi` and (planned)
  `gpt-tokenizer`, keeping the bin entry's cold start unaffected per
  ARCHITECTURE.md's performance targets.
- **Non-interactive escape hatch is mandatory, not optional polish**:
  `init` must be scriptable for CI and for pickcheck's own test suite,
  which can't drive a real TTY prompt loop. `--yes` plus automatic
  non-interactive detection (`process.stdin.isTTY !== true`) route around
  clack entirely, calling the same `runInit()` core function the
  interactive path calls after collecting answers.

## Alternatives considered

- **`prompts` / `enquirer`**: older, less actively maintained, no
  first-class cancel handling (`isCancel`) — clack's cancel semantics map
  cleanly onto "user pressed Ctrl+C mid-scaffold, write nothing".
- **Hand-rolled readline prompts**: avoids a dependency but reinvents
  validation, spinners, and cancellation for a one-command feature: not
  worth it for the UX bar this project sets for itself (DESIGN.md).

## Consequences

- One more dependency, but scoped to a single command and lazy-loaded, so
  it doesn't affect `audit`'s cold start (the path most users run
  repeatedly) or the `< 50ms bin-entry-import` target.
- `init`'s actual scaffolding logic (`engine/init.ts`) stays a plain,
  synchronously-testable function with no prompt library in its call
  graph — `commands/init.ts` is the only file that imports `@clack/prompts`
  at all.
