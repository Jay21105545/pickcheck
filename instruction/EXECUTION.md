# pickcheck — EXECUTION PLAN

Phased so every phase ends in something shippable. Do not start a phase until
the previous phase's acceptance criteria pass.

## Tech Stack (locked — see decisions/)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, target Node 18+ | universal `npx` reach; Bun compat still ~90-95% |
| Build | tsdown (fallback: tsup) | Rolldown/Rust successor to tsup, near-identical API |
| Dev runner | tsx | esbuild-based, ~50ms startup, ts-node is legacy |
| Structural rules | @ast-grep/napi | YAML code patterns = our rules-as-data design; Rust-fast; multi-language |
| CLI routing | commander | boring, correct |
| Interactive init | @clack/prompts | modern create-* UX |
| Terminal output | picocolors + custom renderer | no React/ink dep; cold-start speed is UX |
| Schema | zod | rule.yaml validated; schema = contributor contract |
| Tokens | gpt-tokenizer (WASM, local) | no API needed |
| Tests | vitest | fixture harness + corpus snapshots |
| Lint/format (self) | biome | Rust-fast, replaces ESLint+Prettier |
| Releases | changesets + GH Actions npm publish w/ provenance | |
| Repo | pnpm workspace monorepo | packages/cli, packages/rules, packages/report, apps/docs |

## Phase 0 — Bootstrap (half day)

- pnpm monorepo skeleton, biome, vitest, tsdown configs, CI (typecheck + test).
- Copy docs-kit templates into OUR OWN repo first: CHANGELOG.md, DECISIONS/,
  CONTRIBUTING.md stub, this file set.
- Conventional commits from commit #1.

**Accept:** `pnpm build` produces a runnable `pickcheck --version`.

## Phase 1 — Engine + first 10 rules → v0.1 (week 1)

Engine pipeline:
1. `fast-glob` repo scan honoring .gitignore + pickcheck ignore config
2. Rule loader: read every `rules/*/rule.yaml`, validate with zod, reject bad
3. Detection tiers dispatched per rule: `exists` | `regex` | `astgrep` | `tokens`
4. Findings → scorer (category weights) → renderer (terminal)
5. `--json` machine output; exit 1 if composite < `--min` (default 60)

First 10 rules (ids):
`sec/no-secrets-in-code`, `sec/no-env-in-git`, `sec/no-hallucinated-imports`,
`docs/changelog-exists`, `docs/api-doc-exists`, `docs/env-example-exists`,
`disc/no-console-log`, `qual/no-empty-catch`, `qual/fetch-has-error-handling`,
`sec/post-has-validation` (regex heuristic v1, ast-grep v1.1).

Every rule ships with `fixtures/bad/` (must trigger) and `fixtures/good/`
(must NOT trigger). Vitest auto-discovers and asserts both directions.

**Accept:** self-audit runs on pickcheck's own repo in CI as a required check;
fixture suite green; `npx pickcheck audit` on the examples/broken-app fixture
produces the expected findings snapshot.

## Phase 2 — init + generators → v0.2 (week 2)

- `init`: clack flow → stack detection (package.json/requirements.txt) →
  writes docs-kit + CLAUDE.md/AGENTS.md variant + GH Action audit gate.
- `gen api`: reads routes/app dir, embeds real code into prompt template,
  writes `pickcheck-prompt.md`.
- `gen changelog`: parses `git log`, groups by conventional-commit type.

**Accept:** running `init` then `audit` on a fresh Next.js starter raises its
score ≥ +25 points without touching app code.

## Phase 3 — UI/UX + token categories → v0.3 (week 3)

- UI/UX static rules: missing loading/empty/error states (component fetches
  but renders single branch — ast-grep), img-without-alt, unlabeled inputs,
  onClick-on-div, form-without-pending, inline-hex-count threshold,
  hardcoded px widths.
- Token rules: context-file token budgets, duplicate context detection,
  AI-ignore coverage (lockfiles/build dirs), waste % estimate.
- `gen ux-review`, `gen context-optimize`.
- `.pickcheck/history.json` trend tracking.

**Accept:** five-axis score renders; token report matches manual tiktoken
count within 2%.

## Phase 4 — HTML report + playbook → v0.4 (week 4)

- `audit --report`: self-contained HTML (vanilla JS, inline styles, data as
  embedded JSON). Radial composite score, radar of 5 axes, severity-coded
  finding cards with copy-prompt buttons, token treemap.
- Playbook chapters 01–05: branching, CODEOWNERS & reviews, ADRs,
  versioning & changelogs, monorepos (describing our own repo).
- examples/broken-app: deliberately terrible demo repo for instant trial.

**Accept:** report opens from disk with no network; playbook chapters each
end with "the solo/AI-builder version" + link to template/generator.

## Phase 5 — Launch (week 5)

- Backtest corpus: 30–50 public repos (vibe-coded + well-engineered controls)
  → JSON snapshots → false-positive review → blog post data
  ("We audited 50 AI-built repos…").
- CONTRIBUTING.md "write a rule in 10 minutes" guide.
- npm publish, README badges (self-score, npm, CI), HN/Reddit/X launch.

## Stress-Test & Backtest Protocol (standing, all phases)

1. **Fixture gate:** no rule merges without bad+good fixtures.
2. **Corpus regression:** engine/rule changes re-run the corpus; any findings
   diff must be explained in the PR description.
3. **Control-repo alarm:** if a well-engineered control repo scores < 75,
   treat as a false-positive bug in a rule, not a finding.
4. **Adversarial fixtures:** commented-out code, template-string secrets,
   minified files — documents where regex tier ends and ast-grep begins.

## Definition of Done (v1.0)

- 40+ rules across 5 categories, all fixture-tested
- Self-audit score ≥ 90 published in README
- Corpus report published
- Docs site live (apps/docs, Next.js, Vercel)
