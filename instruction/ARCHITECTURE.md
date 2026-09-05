# pickcheck — ARCHITECTURE

## Monorepo Layout

```
pickcheck/
├── packages/
│   ├── cli/          # commander entry, commands, renderers, engine
│   │   └── src/
│   │       ├── index.ts            # bin entry: Node-version gate, then
│   │       │                       #   `await import("./cli.js")` — nothing
│   │       │                       #   static may load ahead of the gate
│   │       │                       #   (DECISIONS/0025)
│   │       ├── preflight.ts        # the gate itself (node: builtins only)
│   │       ├── cli.ts              # commander program (keep tiny — lazy imports)
│   │       ├── commands/           # audit.ts, init.ts, gen.ts
│   │       ├── engine/             # scan.ts, loader.ts, tiers/, scorer.ts
│   │       ├── render/             # terminal.ts, json.ts, html.ts
│   │       └── util/
│   ├── rules/        # THE content. No engine code here.
│   │   ├── security/…  quality/…  docs/…  discipline/…  ui-ux/…  tokens/…
│   │   ├── _incubating/  # parked rules — loadRules() excludes this dir
│   │   │                 # (DECISIONS/0014); kept with fixtures so the
│   │   │                 # fixture harness still validates them
│   │   └── schema.ts   # zod schema for rule.yaml (single source of truth)
│   └── report/       # HTML report template (vanilla JS, self-contained)
├── playbook/         # 01-branching.md … numbered chapters
├── docs-kit/         # templates copied by `init`
├── generators/       # prompt templates used by `gen`
├── examples/broken-app/   # deliberately bad demo repo
├── corpus/           # backtest corpus (EXECUTION.md's Stress-Test &
│   │                 # Backtest Protocol) — repos.json (pinned by SHA),
│   │                 # snapshots/ (committed), .cache/ (gitignored
│   │                 # clones), run.ts driver (`pnpm corpus`)
├── DECISIONS/        # ADRs
└── apps/docs/        # Next.js docs site (phase 4+)
```

## Engine Pipeline

```
scan (fast-glob, .gitignore- and .pickcheckignore-aware)
  → load rules (zod-validate every rule.yaml; invalid → warn + skip)
  → dispatch by tier:
      exists   — file presence/absence checks
      regex    — line-level patterns with path scoping, optionally gated
                 on whole-file content (pattern.when / pattern.unless)
      astgrep  — structural patterns via @ast-grep/napi (lazy-loaded)
      tokens   — gpt-tokenizer counts vs budgets (lazy-loaded)
      manifest — source specifiers cross-referenced against package.json
      coverage — identifiers used in source vs. declared in a doc file
  → findings[] { ruleId, file, line?, severity, message, fixPrompt }
  → scorer: per-category 0–100 (severity-weighted), composite = weighted mean
  → renderer: terminal | --json | --report (HTML)
  → history append (.pickcheck/history.json)
  → exit code: 0 if composite ≥ minScore else 1
```

## rule.yaml Schema (v1)

```yaml
id: qual/no-empty-catch
category: quality          # security|quality|docs|discipline|ui-ux|tokens
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

See [ADR 0009](../DECISIONS/0009-scoring-diminishing-returns.md)
(supersedes [ADR 0006](../DECISIONS/0006-scoring-recalibration.md)'s
category-aggregation step only — additive per-rule penalties, the
per-rule cap, composite renormalization, `CATEGORY_WEIGHTS`, and gating
all carry forward unchanged; ADR 0006 itself supersedes
[ADR 0004](../DECISIONS/0004-scoring-normalization.md)'s formula).

- A rule is **applicable** to a category if it was actually checked
  against this repo: an unconditional `exists`-tier rule is always
  applicable (a missing file IS the finding, so applicability can't be
  gated on a match existing); a *conditional* `exists`-tier rule
  (`pattern.when` set — [ADR 0005](../DECISIONS/0005-conditional-exists-precondition.md))
  is applicable only if `when.files` matched at least one scanned file; a
  `regex`/`astgrep`/`tokens`/`manifest`/`coverage`-tier rule is applicable only if
  its `files` glob matched at least one scanned file.
- Category penalty accumulation is **additive, not normalized** — no
  division by applicable-rule count — and per-rule contributions are
  capped, both unchanged from ADR 0006:
  ```
  SEVERITY_POINTS = { info: 4, warn: 10, error: 25 }
  PER_RULE_PENALTY_CAP = 50

  categoryPenalty(category) = Σ over rules r with ≥1 finding in category of
    min(PER_RULE_PENALTY_CAP, Σ over r's findings f of
        SEVERITY_POINTS[f.severity] × r.weight)
  ```
  `PER_RULE_PENALTY_CAP` bounds any single rule's contribution to
  `categoryPenalty` regardless of how many times it fires — 200
  `console.log` findings from one rule cost the same capped 50 as one.
- **Category score is a diminishing-returns curve over that penalty, not
  linear subtraction** (ADR 0009 — this is the part that changed):
  ```
  CATEGORY_SCORE_K = 50

  categoryScore(category) = 100 × CATEGORY_SCORE_K /
    (CATEGORY_SCORE_K + categoryPenalty(category))
  ```
  `CATEGORY_SCORE_K` is deliberately equal to `PER_RULE_PENALTY_CAP`
  today (a distinct, independently-tunable constant that happens to
  share a value) — a single rule capped at its maximum lands the
  category at exactly half (`100 × K/(K+K) = 50`), the same anchor value
  ADR 0006's old `clamp(100 − categoryPenalty, 0, 100)` produced for that
  case. What's different is everything past it: the old formula hit
  exactly 0 the instant two capped rules' penalties (`2 × 50 = 100`) met
  the category's fixed 100-point budget, after which further findings in
  that category were invisible — a repo with two real security problems
  and a repo with ten scored identically. A hyperbola never reaches 0 for
  finite input, so a category keeps discriminating "bad" from
  "catastrophic" arbitrarily far past that point. A category with zero
  findings — whether it has zero applicable rules or applicable rules
  that just didn't fire — still *reports* 100.
- Composite is a weighted mean, but **renormalized over only the
  categories with ≥1 applicable rule** for this scan (weights unchanged
  from ADR 0004: security .30, quality .20, docs .15, discipline .15,
  ui-ux .10, tokens .10 — six categories; `quality` split from
  `discipline` before ADR 0004 landed, see
  [ADR 0020](../DECISIONS/0020-quality-category-split.md) for why):
  ```
  composite = Σ(categoryScore × weight) / Σ(weight)   over applicable categories
  composite = 100                                     if no category is applicable
  ```
  A category with no rules loaded (e.g. `ui-ux`/`tokens` pre-Phase-3)
  contributes nothing to the composite rather than a free 100 at full
  nominal weight — see ADR 0006 for why that matters as the ruleset
  grows.
- **Gating severity**: after the weighted composite, each entry in
  `SCORING_GATES` (`packages/cli/src/engine/scorer.ts`) can pull the
  composite down further — `{ category, minSeverity, compositeCap }` —
  if any finding in `category` is at `minSeverity` or worse, `composite =
  min(composite, compositeCap)`. This is a **ceiling, not a fixed
  value**: it only ever lowers a composite that would otherwise exceed
  `compositeCap`, never raises one that's already below it (ADR 0009
  reaffirms this explicitly — it was already `Math.min` under ADR 0006,
  just previously worded ambiguously). General config-driven mechanism,
  not category-specific engine code; the shipped default is
  `{ category: "security", minSeverity: "error", compositeCap: 59 }`, one
  point under the CLI's default `--min 60` so an error-severity security
  finding always fails the default gate, regardless of how the rest of
  the repo scores.

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
