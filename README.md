# pickcheck

**Lighthouse for AI-built apps.** A zero-config CLI that audits everything AI
coding assistants skip — security, code quality, docs, discipline, UI/UX, and
AI-context-token hygiene — and hands back ready-to-paste fix prompts. No LLM
calls, no network, no config file, no signup.

![pickcheck audit report](https://raw.githubusercontent.com/Jay21105545/pickcheck/main/docs/report.png)

[![CI](https://github.com/Jay21105545/pickcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/Jay21105545/pickcheck/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/pickcheck.svg)](https://www.npmjs.com/package/pickcheck)
[![self-audit](https://img.shields.io/badge/self--audit-100%2F100-C6F432)](#dogfooding)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Jay21105545/pickcheck/blob/main/LICENSE)

## The gap

The AI-assisted development ecosystem is saturated on the *input* side —
prompt libraries, Cursor rules collections, vibe-coding playbooks. Almost
nothing audits the *output*. AI-generated code has a signature failure
pattern: the happy path is handled perfectly, the sad path is skipped
entirely — empty catch blocks, no loading/error states, no input validation,
secrets committed straight into source. pickcheck is the mirror image of
every prompt repo: prompts are the input, pickcheck verifies the output.

## Quickstart (60 seconds)

```sh
npx pickcheck audit
```

That's it — no config file, no account, no API key. `audit` scans the
current repo, scores it across six axes, and prints a terminal report with a
severity-coded finding for every real problem, each ending in a `↳ fix:`
line — a ready-to-paste prompt for your own AI assistant to apply. Nothing
here ever calls an LLM itself; pickcheck only *finds* problems and *writes
the prompt*, your assistant does the fixing.

```sh
npx pickcheck audit --report        # also writes a self-contained HTML report
npx pickcheck audit --min 90        # exit 1 if the composite score is below 90 (CI gate)
npx pickcheck audit --json          # machine-readable output
npx pickcheck init                  # scaffold a docs-kit + CI audit gate into a repo
npx pickcheck gen api               # generate an API.md prompt from your real routes
```

Requires Node 22.12+ — on anything older pickcheck exits 1 and tells you
which version it needs and which one you're on. Run
`npx pickcheck audit --help` for every flag.

## What it checks

Six scored axes, composited into one number (0–100), plus an unscored
AI-context-token report. 20 rules today — every one of them lives in
[`packages/rules/`](https://github.com/Jay21105545/pickcheck/tree/main/packages/rules) as a `rule.yaml` + fixtures, so adding
one is a docs contribution, not an engine change (see
[CONTRIBUTING.md](https://github.com/Jay21105545/pickcheck/blob/main/CONTRIBUTING.md)).

| Category | Weight | Catches things like |
|---|---|---|
| **Security** | 30% | Secrets committed to source, a tracked `.env`, an import absent from `package.json` (a slopsquatting target), a request body read with no validation library, raw card-number fields with no payment SDK. |
| **Quality** | 20% | Empty `catch` blocks (errors silently swallowed), `fetch()` calls with no error handling at all. |
| **Docs** | 15% | No `CHANGELOG.md`, no `API.md` for a detected API surface, a `.env` with no `.env.example`. |
| **Discipline** | 15% | `console.log` left in application code. |
| **UI/UX** | 10% | Missing loading/error/empty states, `<img>` with no `alt`, `<input>` with no accessible label, `onClick` on a non-interactive element, a submit button with no pending state, a destructive action with no confirmation step, design-token drift (many inline hex colors). |
| **Tokens** | 10% | `CLAUDE.md`/`AGENTS.md`/etc. over its token budget, duplicated content across AI context files (measured locally with `gpt-tokenizer`, never sent anywhere). |

Every finding is severity-coded (`error`/`warn`/`info`), and a security
`error` finding caps the composite at 59 regardless of everything else — a
repo can't accidentally score "fine" while leaking secrets.

## Does it actually work? The corpus says yes — with a caveat it took a bigger corpus to find

pickcheck is backtested against a pinned-by-commit-SHA corpus of 13 real
repos. It is a 2x2: repos an AI builder actually wrote end to end
([Lovable](https://lovable.dev) and [v0](https://v0.app), verified by
generator marker *and* by the share of commits their bot accounts authored)
against hand-picked, well-engineered human-built controls — each arm
covering both Next.js and Vite/React, so a rule can't score well by
detecting the framework and calling it provenance.

| Repo | Type | Stack | Composite |
|---|---|---|---|
| `steven-tey/precedent` | control | Next.js | **86.11** |
| `shadcn-ui/taxonomy` | control | Next.js | **79.54** |
| `nextjs/saas-starter` | control | Next.js | **78.70** |
| `vercel/commerce` | control | Next.js | **76.42** |
| `cinnyapp/cinny` | control | Vite | **68.08** |
| `buildship-ai/rowy` | control | Vite | **47.58** |
| theghost | AI-generated | Next.js | **65.91** |
| fin-bloom-dash | AI-generated | Vite | **59.00** |
| ai-career-assistant | AI-generated | Next.js | **58.50** |
| shelfly-creator-hub | AI-generated | Vite | **53.88** |
| mindtrack-personalwellness | AI-generated | Vite | **53.87** |
| sports-on-the-go | AI-generated | Vite | **40.51** |
| newattendanceapp | AI-generated | Next.js | **40.44** |

The AI-generated arm scores materially worse — mean 53.2 against the
controls' 72.7 — and every Lovable app in it has at least one
`error`-severity security finding, which caps the composite at 59
regardless of how the rest of the repo scores. That gate mechanism exists
precisely so a real, exploitable gap can't be averaged away by a tidy UI.

**The separation is not clean, and we'd rather say so than crop the table.**
`buildship-ai/rowy` is a human-built product that scores 47.58 — below most
of the AI arm. Nearly all of that is one rule's false positives:
`sec/no-hallucinated-imports` doesn't yet follow `tsconfig.json`'s
`extends`, so 1,666 path-aliased imports read as undeclared packages — and
because they carry `error` severity, they trip the same security gate
described above on a repo that has done nothing wrong. Excluding that rule
it scores 64.25, still under the 75 we'd expect of a control. Until the
four-repo corpus grew a Vite control arm, that bug was invisible and the
table looked perfect. Adding repos that could embarrass the tool is the
point of having a corpus, and the write-up is in
[DECISIONS/0029](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0029-corpus-confound-and-expansion.md).

Re-run it yourself: `pnpm corpus` (see
[CONTRIBUTING.md](https://github.com/Jay21105545/pickcheck/blob/main/CONTRIBUTING.md)).

## The playbook

The rules encode practices; [`playbook/`](https://github.com/Jay21105545/pickcheck/blob/main/playbook/README.md) explains them.
Five chapters on how 100+ dev organizations actually work — and, at the end
of each, **the solo/AI-builder version**: the part of the practice that
prevents real disasters without the ceremony that only pays off at scale.

- [01 — Branching](https://github.com/Jay21105545/pickcheck/blob/main/playbook/01-branching.md) — why branch age, not branch
  strategy, is what hurts, and what `main` protection is for when you're
  the only one pushing to it.
- [02 — CODEOWNERS and reviews](https://github.com/Jay21105545/pickcheck/blob/main/playbook/02-codeowners-and-reviews.md) —
  what review is actually for, and what substitutes for it when there is
  no second human and the author is an assistant.
- [03 — ADRs and design docs](https://github.com/Jay21105545/pickcheck/blob/main/playbook/03-adrs-and-design-docs.md) — how a
  decision survives its author, and why that matters more when your
  collaborator forgets everything between sessions.
- [04 — Versioning and changelogs](https://github.com/Jay21105545/pickcheck/blob/main/playbook/04-versioning-and-changelogs.md)
  — the version as a contract with consumers, and the one file that
  answers "which build?".
- [05 — Monorepos](https://github.com/Jay21105545/pickcheck/blob/main/playbook/05-monorepos.md) — what one repository buys and
  what it charges, worked through this repo's own layout.

## Screenshots

*(Coming soon.)* Run `npx pickcheck audit --report` and open
`.pickcheck/report.html` in a browser to see the real thing today — an
animated composite score, a radar chart across all six categories, finding
cards with expandable code snippets and a one-click "Copy fix prompt"
button, and a token treemap of your AI context files. Dark-first, a light
toggle, zero network requests once generated.

## Dogfooding

pickcheck audits itself in CI on every push and PR (`pnpm self-audit`,
gated at `--min 90`) — currently **100/100**. If a change ever drops that
score, the fix is to fix the actual problem the rule found, never to relax
the rule. See [CLAUDE.md](https://github.com/Jay21105545/pickcheck/blob/main/CLAUDE.md) and
[DECISIONS/](https://github.com/Jay21105545/pickcheck/tree/main/DECISIONS) for the reasoning behind every rule and every
scoring change.

## How it's built

- **No LLM calls, ever, inside the tool.** `gen <type>` commands write a
  paste-ready prompt file; your own assistant does the writing. Keeps
  pickcheck free, keyless, and private — see
  [ADR 0002](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0002-no-llm-calls.md).
- **No network calls at runtime.** Everything — the scan, the scoring, the
  HTML report — runs entirely on your machine.
- **Rules are data.** A rule is one folder: `rule.yaml` + a README with a
  fix prompt + `fixtures/bad` + `fixtures/good`. The detection engine never
  contains rule-specific code.
- TypeScript, a pnpm workspace, `@ast-grep/napi` for structural rules,
  `gpt-tokenizer` for local token counting, zero heavy deps on the CLI's
  cold-start path. See [instruction/ARCHITECTURE.md](https://github.com/Jay21105545/pickcheck/blob/main/instruction/ARCHITECTURE.md).

## Contributing

Adding a rule takes about ten minutes and needs zero engine knowledge — see
[CONTRIBUTING.md](https://github.com/Jay21105545/pickcheck/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/Jay21105545/pickcheck/blob/main/LICENSE)
