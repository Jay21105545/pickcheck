<div align="center">

<img src="https://raw.githubusercontent.com/Jay21105545/pickcheck/main/docs/wordmark.svg" alt="pickcheck" width="340">

### Lighthouse for AI-built apps.

Audits the code your assistant wrote for the things it never writes —
and hands back a fix prompt for every one of them.

[![npm](https://img.shields.io/npm/v/pickcheck?style=flat-square&color=C6F432&labelColor=141416&label=npm)](https://www.npmjs.com/package/pickcheck)
[![CI](https://img.shields.io/github/actions/workflow/status/Jay21105545/pickcheck/ci.yml?branch=main&style=flat-square&labelColor=141416&label=CI)](https://github.com/Jay21105545/pickcheck/actions/workflows/ci.yml)
[![self-audit](https://img.shields.io/badge/self--audit-100%2F100-C6F432?style=flat-square&labelColor=141416)](#why-you-can-trust-the-numbers)
[![node](https://img.shields.io/badge/node-%E2%89%A5%2022.12-8B8B92?style=flat-square&labelColor=141416)](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0024-node-floor-22.md)
[![license](https://img.shields.io/badge/license-MIT-8B8B92?style=flat-square&labelColor=141416)](https://github.com/Jay21105545/pickcheck/blob/main/LICENSE)

<br>

<img src="https://raw.githubusercontent.com/Jay21105545/pickcheck/main/docs/report.png" alt="The pickcheck HTML report: a composite score, a radar chart across six categories, and per-category score bars">

</div>

---

## What is this?

AI coding assistants write the happy path beautifully and skip the sad path
entirely. The feature works on the first try, and underneath it there's an
empty `catch`, no loading state, no input validation, a checkout that never
charges anyone, and the API key sitting in source.

pickcheck is the inspection that catches what got skipped. Point it at a
repo and it scores six categories, tells you exactly what's wrong and where,
and writes the prompt to paste back into your assistant to fix it. It never
calls an LLM, never touches the network, and needs no config file.

## Quickstart

```sh
npx pickcheck audit
```

No config. No API key. No account. It scans the current repo, scores it
0–100, and prints every finding with a `↳ fix:` line under it — a
ready-to-paste prompt for your own assistant.

<details>
<summary><b>What the output actually looks like</b></summary>

<br>

Run against [`examples/broken-app`](https://github.com/Jay21105545/pickcheck/tree/main/examples/broken-app),
the deliberately terrible demo repo in this repository:

```
┌─ pickcheck audit
│ Score       [████████░░░░░░░░░░░░] 39.75/100
│ security    [███░░░░░░░░░░░] 22.73
│ quality     [████░░░░░░░░░░] 27.78
│ docs        [██████░░░░░░░░] 45.45
│ discipline  [████████████░░] 83.33
│ ui-ux       [████░░░░░░░░░░] 25
│ tokens      [████████░░░░░░] 55.56
│ 25 rules · 19 files · 23 findings
└─

AI context surface: 4595 tokens across 2 files · est. 1.7% waste
  CLAUDE.md — 4485 tokens
  AGENTS.md — 110 tokens

security (22.73)
  ✖ .env — A .env file is present and not git-ignored — it will be
    committed with real secrets in it.
    ↳ fix: Fix ".env file tracked in the repo" (sec/no-env-in-git) at .env: A .env file is pres…
  ✖ lib/config.ts:3 — A hardcoded secret looks like it's committed to
    source — rotate it and load it from the environment instead.
    ↳ fix: Fix "Hardcoded secret in source" (sec/no-secrets-in-code) at lib/config.ts:3: A hard…

quality (27.78)
  ✖ lib/api-client.ts:9 — Errors are being silently swallowed — the catch
    block is empty or contains only a comment.
    ↳ fix: Fix "Empty catch block" (qual/no-empty-catch) at lib/api-client.ts:9: Errors are bei…
```

Message lines are shown soft-wrapped as a terminal renders them; the text and
the truncated `↳ fix:` lines are verbatim.

</details>

<details>
<summary><b>Every command and flag</b></summary>

<br>

| Command | What it does |
|---|---|
| `pickcheck audit` | Scan, score, print the terminal report |
| `pickcheck audit --report` | Also write a self-contained HTML report to `.pickcheck/report.html` |
| `pickcheck audit --min 90` | Exit 1 below a composite of 90 — the CI gate (default `60`) |
| `pickcheck audit --json` | Machine-readable output |
| `pickcheck audit --quiet` | One CI-friendly summary line |
| `pickcheck audit --rules-dir <path>` | Load rules from your own directory |
| `pickcheck init` | Scaffold a docs-kit, AI conventions file, and a CI audit gate. Never overwrites |
| `pickcheck gen api` | Write a prompt that documents your real API routes |
| `pickcheck gen changelog` | Write a prompt that turns your git log into a changelog entry |

Requires Node 22.12+. On anything older, pickcheck exits 1 and tells you
which version it needs and which one you're on
([ADR 0025](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0025-preflight-node-version-gate.md)).

</details>

## What it checks

Six scored categories composited into one number, plus an unscored report on
what your AI context files cost. **25 rules** today — each one a folder of
`rule.yaml` + fixtures in
[`packages/rules/`](https://github.com/Jay21105545/pickcheck/tree/main/packages/rules),
never engine code.

Every example below is a real finding from the backtest corpus, at the file
and line pickcheck reported it.

| Category | Weight | A finding it actually caught |
|---|---|---|
| **Security** | 30% | Two Supabase Edge Functions deployed with `verify_jwt = false` — publicly callable, running on the owner's AI gateway key.<br>`sports-on-the-go` · `supabase/config.toml:4` |
| **Quality** | 20% | A Supabase write whose `{ data, error }` result is thrown away, so a row blocked by RLS returns as success.<br>`mindtrack-personalwellness` · `supabase/functions/chat/index.ts:74` |
| **Docs** | 15% | 260 API route handlers, no `API.md` and no OpenAPI spec.<br>`newattendanceapp` · repo root |
| **Discipline** | 15% | 688 `console.log` calls left in application code, including payroll and attendance routes.<br>`newattendanceapp` · `app/api/leave/payment-advice/submit-memo/route.ts:117` |
| **UI/UX** | 10% | A component that fetches market data and renders only the success path — no loading, error, or empty state.<br>`fin-bloom-dash` · `src/components/advisor/MarketTicker.tsx:33` |
| **Tokens** | 10% | A `CLAUDE.md` at 4,485 tokens against a 4,000 budget, with a paragraph duplicated verbatim into `AGENTS.md` — every assistant reading both pays twice.<br>`examples/broken-app` |

The tokens example comes from this repo's demo app rather than the corpus:
none of the 13 corpus repos ships an AI context file at all, so those two
rules have nothing to fire on there.

A security `error` caps the composite at 59 no matter how good the rest is,
so a repo can't score "fine" while leaking secrets.

## Benchmarks

pickcheck is backtested against 13 real repos, each pinned by commit SHA. It
is a 2x2 — repos an AI builder wrote end to end against hand-picked
human-built controls, each arm covering both Next.js and Vite/React — so a
rule can't score well by detecting the framework and calling it provenance.

Provenance is measured, not asserted: a generator marker in the tree **plus**
the share of commits authored by the generator's own bot account. The
admission threshold, **≥70%**, was fixed before any new repo was audited.

| Repo | Type | Stack | Provenance | Composite |
|---|---|:--|---|--:|
| `steven-tey/precedent` | control | Next.js | Human-authored, no marker | **86.11** |
| `shadcn-ui/taxonomy` | control | Next.js | Human-authored, no marker | **79.54** |
| `nextjs/saas-starter` | control | Next.js | Human-authored · official Vercel template | **78.70** |
| `vercel/commerce` | control | Next.js | Human-authored · Vercel-maintained | **76.42** |
| `cinnyapp/cinny` | control | Vite | Human-authored · team-maintained since 2021 | **70.72** |
| theghost | AI-generated | Next.js | v0.app · 16/17 commits (94%) | **56.96** |
| fin-bloom-dash | AI-generated | Vite | Lovable · 41/43 commits (95%) | **55.64** |
| shelfly-creator-hub | AI-generated | Vite | Lovable · 8/8 commits (100%) | **50.18** |
| mindtrack-personalwellness | AI-generated | Vite | Lovable · 23/32 commits (72%) | **50.07** |
| ai-career-assistant | AI-generated | Next.js | v0.app · 2/2 commits (100%) | **49.55** |
| `buildship-ai/rowy` | control | Vite | Human-authored · company-built product | **47.58** |
| newattendanceapp | AI-generated | Next.js | v0.app · 95/100 commits (95%) | **39.10** |
| sports-on-the-go | AI-generated | Vite | Lovable · 97/100 commits (97%) | **37.63** |

**Control mean 73.18 · AI-generated mean 48.45.** Five of the six controls sit
above every AI-generated repo. The single overlap is `buildship-ai/rowy` at
47.58, and it stays in the table rather than being cropped out of it.

Every URL and SHA is in
[`corpus/repos.json`](https://github.com/Jay21105545/pickcheck/blob/main/corpus/repos.json);
re-run the whole thing with `pnpm corpus`.

### What these numbers do and don't show

The first version of this corpus couldn't tell "AI-written" from "Vite SPA".
Every control was a Next.js app and every AI-generated repo was a Vite SPA,
so `stack` and `provenance` were **perfectly correlated** — and every
measurement of the form "this signal detects AI-generated code" was
numerically identical to "this signal detects Vite". Any rule scoring 100%
was scoring 100% on both claims at once, and no amount of careful reading
could separate them. The fix was filling both empty cells with real,
third-party, pinned repos —
[ADR 0029](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0029-corpus-confound-and-expansion.md).

**Two candidate rules died on contact with that corpus**, both because they
tracked the framework rather than the generator:

- **tsconfig strictness.** A clean 100% separator on the old corpus. On the
  2x2 its framework delta (+0.52) exceeded its generator delta (+0.40), and
  within the Next.js stratum it separated *backwards* — the only repo that
  fired was a control, `shadcn-ui/taxonomy`, while all three v0-generated
  apps shipped `"strict": true`. The four Lovable repos carried
  byte-identical settings because they were the starter template's defaults.
  It was a template detector wearing a provenance detector's label.
- **`any` density.** No threshold works. The best cutoff tops out at 77%
  accuracy: `rowy`, a company-built control, carries 8.90 `any` per kloc —
  higher than six of the seven AI-generated repos — while
  `shelfly-creator-hub`, pure Lovable output, carries 0.00.

What survived was shipped: `qual/no-typecheck-anywhere` and
`disc/builder-metadata-left-behind`, both 100% across both strata. The
second one ships at `info` severity with a README saying plainly that **it is
not evidence** — it separates the arms by reading the generator's own
signature, so any argument leaning on it is circular.

What this is not: a causal claim, or a general law about AI-written code.
n=13, two generators (Lovable and v0), and two cells are thin at n=2 and
n=3 — enough to falsify a perfect separator, not enough to confirm one. One
shipped rule, `ux/inline-hex-threshold`, is still confounded (+0.52
generator against +0.71 framework) and is flagged for its own precision
review rather than quietly left in.

## Precision, measured and published

A finding you don't trust is worse than no finding. Precision is audited by
hand — every finding on every corpus repo classified true or false against
the repo's own source — and the results are published whether or not they
flatter the tool.

| When | What was measured | Precision |
|---|---|--:|
| Launch ruleset | 12 TP / 21 FP / 4 arguable across all firing rules | **36%** |
| After calibration ([ADR 0014](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0014-ruleset-calibration.md)) | 9 TP / 1 FP / 1 arguable | **90%** |
| `sec/no-hallucinated-imports`, before | 22 TP / 1,646 FP of 1,668 findings | **1.3%** |
| `sec/no-hallucinated-imports`, after ([ADR 0030](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0030-two-false-positives-and-two-rules.md)) | 22 TP / 17 FP of 39 findings | **56.4%** |

`ux/hardcoded-px-width` measured **18%** precision — 3 true positives against
14 false ones. It was moved to `packages/rules/_incubating/` instead of
shipping noisy. Pulling a rule on its numbers is the pattern, not the
exception.

The hallucinated-imports fix was one root cause: the engine read a
`tsconfig.json` exactly one file deep, so `rowy`'s path aliases — declared in
a config it reached through `extends` — read as undeclared npm packages.
Following the `extends` chain removed 1,629 false positives with **recall
unchanged**: all 22 true positives survived.

<details>
<summary><b>And the fix didn't move the score at all — which is the part worth knowing</b></summary>

<br>

`rowy` scored 47.58 before removing 1,629 false positives and **47.58**
after. A per-rule penalty cap
([ADR 0006](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0006-scoring-recalibration.md))
means one finding and 1,666 findings from the same rule cost exactly the
same, and `rowy` still has 20 genuine phantom dependencies firing it.

So finding-count changes and score changes are only loosely coupled: a rule
can go from catastrophically noisy to accurate and leave the composite
untouched. What the fix bought was a readable report — 77 findings instead
of 1,706, with 20 real defects no longer buried under 1,629 aliases.

An earlier version of this README predicted a score recovery from that fix.
It didn't happen, and the claim was corrected rather than left standing.

</details>

## Two findings worth the whole tool

**A public endpoint on the owner's API key.**
`sports-on-the-go` ships `supabase/config.toml` with `verify_jwt = false` on
both of its Edge Functions. That one line is what makes a `401` go away
during development, and nothing later in the build ever gives you a reason to
put it back. Both functions read `LOVABLE_API_KEY` from `Deno.env` and proxy
to an AI gateway — so anyone who reads the network tab, or guesses
`https://<project-ref>.supabase.co/functions/v1/chat-sporty`, is billing
their own traffic to the owner's key.

**A checkout that fakes the payment.**
`shelfly-creator-hub`'s `src/pages/CheckoutPage.tsx:45` collects card details
into a form whose submit handler is this, in full:

```ts
// Simulate checkout process
await new Promise(resolve => setTimeout(resolve, 1500));

setIsSubmitting(false);
setIsCompleted(true);
clearCart();
```

There is no `fetch`, no Stripe, no Supabase call anywhere in the file. It
waits 1.5 seconds, empties the cart, and renders a green check above the
words **"Payment Successful!"** Every part of that flow works exactly as an
assistant would demo it, and no money moves.

## Why you can trust the numbers

| | |
|---|---|
| **It audits itself** | `pnpm self-audit` runs on every push and PR, gated at `--min 90`. Currently **100/100** with zero findings. If a change drops that score, the rule stands and the code gets fixed |
| **Signed releases** | Every npm publish carries [SLSA build provenance](https://www.npmjs.com/package/pickcheck), minted from GitHub's OIDC token in [`release.yml`](https://github.com/Jay21105545/pickcheck/blob/main/.github/workflows/release.yml) |
| **30 decision records** | Every tier, weight, dependency and scoring change has a [dated ADR](https://github.com/Jay21105545/pickcheck/tree/main/DECISIONS) with the options that lost |
| **Corpus regression gate** | Engine and rule changes re-run all 13 repos. An unexplained findings diff blocks the PR |
| **Mandatory false-positive suite** | No rule merges without `fixtures/bad/` **and** `fixtures/good/` — near-miss samples that must *not* trigger |
| **Control-repo alarm** | A well-engineered control scoring under 75 is treated as a bug in a rule, not as a finding about the repo |

Two of these caught real problems in the last release cycle, which is the
only reason to believe they work.

## The playbook

The rules encode the practices;
[`playbook/`](https://github.com/Jay21105545/pickcheck/blob/main/playbook/README.md)
explains them. Five chapters on how 100+ developer organizations actually
work — and at the end of each, **the solo/AI-builder version**: the part that
prevents real disasters without the ceremony that only pays off at scale.

| # | Chapter | The question it answers |
|---|---|---|
| 01 | [Branching](https://github.com/Jay21105545/pickcheck/blob/main/playbook/01-branching.md) | How long can work stay separated from `main` before merging becomes its own project? |
| 02 | [CODEOWNERS and reviews](https://github.com/Jay21105545/pickcheck/blob/main/playbook/02-codeowners-and-reviews.md) | What is review actually for, and what replaces it when there's no second human? |
| 03 | [ADRs and design docs](https://github.com/Jay21105545/pickcheck/blob/main/playbook/03-adrs-and-design-docs.md) | How does the reasoning behind a decision outlive the session that made it? |
| 04 | [Versioning and changelogs](https://github.com/Jay21105545/pickcheck/blob/main/playbook/04-versioning-and-changelogs.md) | How does a consumer decide whether upgrading is safe? |
| 05 | [Monorepos](https://github.com/Jay21105545/pickcheck/blob/main/playbook/05-monorepos.md) | What does one repository buy, and what does it charge? |

## Contributing

**A rule is a folder, not a code change.** `rule.yaml` + a README with a fix
prompt + `fixtures/bad/` + `fixtures/good/`. The engine contains no
rule-specific code and the test harness discovers your rule automatically —
so writing one needs no engine knowledge and takes about ten minutes.

→ [**Write a rule in 10 minutes**](https://github.com/Jay21105545/pickcheck/blob/main/CONTRIBUTING.md#write-a-rule-in-10-minutes)

If a rule needs a capability the engine doesn't have, that becomes a new
detection *tier* and an ADR — never a special case. See
[CONTRIBUTING.md](https://github.com/Jay21105545/pickcheck/blob/main/CONTRIBUTING.md)
for the corpus requirements on engine changes, and
[instruction/ARCHITECTURE.md](https://github.com/Jay21105545/pickcheck/blob/main/instruction/ARCHITECTURE.md)
before touching the engine.

## Roadmap

Open items, each traceable to the record that opened it.

| | Status |
|---|---|
| Fix the third false-positive class in `sec/no-hallucinated-imports` — commented-out sample imports inside template literals, 17 findings on `rowy` | Next precision fix ([ADR 0030](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0030-two-false-positives-and-two-rules.md)) |
| Precision review of `ux/inline-hex-threshold`, still framework-confounded | Open ([ADR 0029](https://github.com/Jay21105545/pickcheck/blob/main/DECISIONS/0029-corpus-confound-and-expansion.md)) |
| Re-derive the control-repo alarm threshold, calibrated on Next.js only | Open |
| A third generator arm — bolt.new or Replit — which would test both new rules at once | Planned |
| Docs site, with every rule README auto-published as a page | Planned |
| 40+ rules across all six categories | 25 today |

## About

pickcheck was built after six years of corporate engineering across fintech,
payments, and cloud infrastructure — environments where changelogs, design
records, code owners, and review gates aren't optional, because process
enforces them.

Solo builders working with AI have none of that scaffolding. The assistant
writes the happy path, ships, and moves on. Nothing forces the docs to
exist, nothing catches the swallowed error, and nobody reviews the checkout
that doesn't charge anyone.

This tool is that missing scaffolding, packaged into one command.

## License

[MIT](https://github.com/Jay21105545/pickcheck/blob/main/LICENSE)
