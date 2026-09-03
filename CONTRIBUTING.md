# Contributing to pickcheck

## Setup

```sh
pnpm install
```

This repo is pinned to Node 22 via `.nvmrc` (`nvm use`) — see
[ADR 0003](DECISIONS/0003-tsup-and-node22-toolchain.md) for why the CLI's
own build/dev tooling needs it even though the shipped CLI still targets
Node 18+ at runtime.

## Before opening a PR

```sh
pnpm typecheck
pnpm test
pnpm check
pnpm self-audit
```

All four must be green. If your change touches `packages/rules/` or
`packages/cli/src/engine/`, also run the corpus (below) and include its
diff in your PR description.

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, …).
- Record any non-obvious architectural choice — new dependency, new
  detection tier, scoring change, breaking CLI flag — in `DECISIONS/`
  (see `DECISIONS/0001-record-architecture-decisions.md`).
- Biome for lint/format (`pnpm check`) — never hand-format against it.

## Adding or changing a rule

See CLAUDE.md's "When Adding a Rule" section for the folder shape
(`rule.yaml` + `README.md` with a fix prompt + `fixtures/bad` +
`fixtures/good`) and `pnpm test`'s fixture gate — no rule merges without
both fixture directions passing.

Fixtures prove a rule behaves as *designed* against synthetic samples.
They do not prove the design is *precise* against real code — a rule can
pass every fixture it was written to pass and still be wrong most of the
time in practice, which is exactly what happened to `ux/hardcoded-px-width`
before it was pulled (see
[DECISIONS/0014](DECISIONS/0014-ruleset-calibration.md)). That's what the
corpus is for.

### Required: run the corpus and include its diff

**Any rule addition, rule change (pattern, `files`, severity, weight), or
engine/tier change must be run against the backtest corpus, and the
resulting diff pasted into the PR description** — this is EXECUTION.md's
Stress-Test & Backtest Protocol, item 2 ("Corpus regression: engine/rule
changes re-run the corpus; any findings diff must be explained in the PR
description"), not optional polish.

```sh
pnpm corpus
```

Runs the built CLI against every repo in `corpus/repos.json` (pinned by
commit SHA — see its own comments for the control/ai-generated split) and
diffs the result against the committed snapshots in `corpus/snapshots/`.
No diff → exits 0, nothing to do. A diff → exits 1 and prints exactly
which findings were added/removed, grouped by repo and rule:

```
=== commerce (control) ===
  ux/input-missing-label: +0 -2
    - components/layout/navbar/search.tsx:15
    - components/layout/navbar/search.tsx:34
```

Review the diff:
- **Every removed finding should be one you recognize as a false positive
  you just fixed.** If a finding disappeared that you didn't intend to
  touch, your change is broader than you think.
- **Every added finding should be a real issue in real code**, not new
  noise. If a change adds findings on a well-regarded control repo (the
  four non-AI-generated repos in `corpus/repos.json`), that's the
  control-repo alarm from EXECUTION.md — treat it as a bug in the rule,
  not a finding, before shipping.

Once you've confirmed the diff is intentional, accept it as the new
baseline and commit the updated snapshot files:

```sh
pnpm corpus -- --update
```

Paste the diff output (from the plain `pnpm corpus` run, before
`--update`) into your PR description, with a sentence on why each line is
correct — the same discipline `qual/no-empty-catch`'s own README expects
of application code applies here: a change with no visible effect on
anything real isn't verified, it's just untested.

If you're adding a genuinely new false-positive pattern's fixture (per
the calibration workflow), add it to the relevant rule's `fixtures/good/`
*and* confirm the corpus diff doesn't regress — a rule that's precise
against its own fixtures but still wrong on the corpus means the fixture
doesn't actually capture the real pattern.

### Adding a repo to the corpus

Append to `corpus/repos.json`: `name`, `url`, a pinned `sha` (not a
branch — reproducibility requires an exact commit), `category`
(`"control"` for well-engineered reference repos, `"ai-generated"` for
repos actually produced by an AI tool, not merely AI-tool-friendly
boilerplate), and a one-line `note` on why it's there. Run `pnpm corpus
-- --update` to seed its baseline snapshot.
