# pickcheck — ARCHITECTURE

## Monorepo Layout

```
pickcheck/
├── packages/
│   ├── cli/          # commander entry, commands, renderers, engine
│   │   └── src/
│   │       ├── index.ts            # bin entry (keep tiny — lazy imports)
│   │       ├── commands/           # audit.ts, init.ts, gen.ts
│   │       ├── engine/             # scan.ts, loader.ts, tiers/, scorer.ts
│   │       ├── render/             # terminal.ts, json.ts, html.ts
│   │       └── util/
│   ├── rules/        # THE content. No engine code here.
│   │   ├── security/…  docs/…  discipline/…  ui-ux/…  tokens/…
│   │   └── schema.ts   # zod schema for rule.yaml (single source of truth)
│   └── report/       # HTML report template (vanilla JS, self-contained)
├── playbook/         # 01-branching.md … numbered chapters
├── docs-kit/         # templates copied by `init`
├── generators/       # prompt templates used by `gen`
├── examples/broken-app/   # deliberately bad demo repo
├── DECISIONS/        # ADRs
└── apps/docs/        # Next.js docs site (phase 4+)
```

## Engine Pipeline

```
scan (fast-glob, .gitignore-aware)
  → load rules (zod-validate every rule.yaml; invalid → warn + skip)
  → dispatch by tier:
      exists   — file presence/absence checks
      regex    — line-level patterns with path scoping
      astgrep  — structural patterns via @ast-grep/napi (lazy-loaded)
      tokens   — gpt-tokenizer counts vs budgets (lazy-loaded)
  → findings[] { ruleId, file, line?, severity, message, fixPrompt }
  → scorer: per-category 0–100 (severity-weighted), composite = weighted mean
  → renderer: terminal | --json | --report (HTML)
  → history append (.pickcheck/history.json)
  → exit code: 0 if composite ≥ minScore else 1
```

## rule.yaml Schema (v1)

```yaml
id: qual/no-empty-catch
category: quality          # security|docs|discipline|ui-ux|tokens|quality
severity: error            # info|warn|error
tier: astgrep
title: Empty catch block
files: ["**/*.{ts,tsx,js,jsx}"]
pattern:                   # tier-specific payload
  rule:
    kind: catch_clause
    has: { kind: statement_block, regex: '^\{\s*\}$' }
message: "Errors are being silently swallowed."
weight: 3                  # relative weight inside its category
```

- `pattern` shape is discriminated-union'd by `tier` in zod.
- ast-grep tier passes the payload straight to @ast-grep/napi — pickcheck
  gains multi-language structural matching for free (TS/JS/TSX/Python/Go).

## Scoring

- Category score = 100 − Σ(finding weight × severity multiplier), floor 0.
  Multipliers: info 0.5, warn 1, error 2. Normalized by rules-applicable
  count so small repos aren't over-punished.
- Composite = weighted mean (weights in one config object, changed only via
  decision record): security .30, quality .20, docs .15, discipline .15,
  ui-ux .10, tokens .10.

## Renderer Principles

- Terminal: grouped by category → severity; box-drawn summary card; score
  bar; ≤ 100 cols safe; `--quiet` for CI; zero output pollution on `--json`.
- HTML report: single file, embedded JSON, no CDN/network, opens from disk,
  dark-mode-first. Copy-prompt buttons per finding.

## Performance Targets

- `audit` on a 2k-file Next.js repo: < 3s warm, < 5s cold (regex+exists).
- ast-grep tier adds ≤ 2s on same repo.
- Bin entry imports < 50ms before command dispatch (measure in CI).

## Extension Points (design now, build later)

- `pickcheck.config.ts`: rule enable/disable, custom budgets, custom rules dir.
- Plugin rules: any npm package exposing a rules/ dir with the same schema.
- v2 `--visual`: Playwright + axe-core route screenshots (separate opt-in
  package, never a core dependency).
