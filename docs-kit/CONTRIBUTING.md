# Contributing — {{PROJECT_NAME}}

## Setup

```sh
{{INSTALL_CMD}}
```

## Before opening a PR

```sh
{{TEST_CMD}}
{{LINT_CMD}}
```

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, …) — `pickcheck gen
  changelog` groups history by these types.
- Record any non-obvious architectural choice in `DECISIONS/` (see
  `DECISIONS/0001-record-architecture-decisions.md`).
- Run `npx pickcheck audit` before pushing — this repo's CI gate fails
  under a composite score of {{MIN_SCORE}}.
