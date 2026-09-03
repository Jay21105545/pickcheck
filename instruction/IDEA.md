# pickcheck — IDEA

> **One line:** Lighthouse for AI-built apps. A zero-config CLI that audits everything AI builders skip — security, code quality, docs, discipline, UI/UX, and token efficiency — and hands back ready-to-paste fix prompts.

## The Gap

The AI-assisted development ecosystem is saturated on the **input** side:
prompt libraries, cursor rules collections, leaked system prompts, vibe-coding
playbooks. Hundreds of repos, some with 100K+ stars.

Almost nothing exists on the **output verification** side. Nobody audits what
the AI actually produced. Meanwhile:

- AI-generated code has a signature failure pattern: happy path handled
  perfectly, sad path skipped entirely (empty catch blocks, no loading/error
  states, no input validation).
- Solo AI builders skip everything a 100-dev company enforces by process:
  changelogs, API docs, ADRs, CODEOWNERS, review gates, semantic versioning.
- Context files (CLAUDE.md, .cursorrules) bloat unchecked, wasting tokens and
  degrading every future AI session on the repo.

**pickcheck is the mirror image of every prompt repo.** Prompts are the input.
pickcheck verifies the output.

## What It Is

A TypeScript CLI (`npx pickcheck`) with three commands:

| Command | What it does |
|---|---|
| `audit` | Scans the repo against a modular ruleset. Prints a scored report (terminal + optional self-contained HTML). Exit code gates CI. |
| `init`  | Scaffolds enterprise discipline into a new/existing repo: docs-kit templates, context files, CI workflow. Stack-aware. |
| `gen <type>` | Generates docs *from the actual code* by producing a precision prompt the user pastes into their own Claude/Cursor. Types: `api`, `changelog`, `architecture`, `adr`, `ux-review`, `context-optimize`. No API keys — ever. |

## The Six Categories (score axes)

1. **Security** — exposed keys, .env in git, unauthenticated endpoints,
   unvalidated input, hallucinated imports (slopsquatting risk).
2. **Quality** — empty catch blocks (errors silently swallowed), `fetch()`
   calls with no error handling at all. Split out from Discipline early
   (RULESET.md's original ten rules already used a distinct `qual/`
   prefix) — see [DECISIONS/0020](../DECISIONS/0020-quality-category-split.md).
3. **Docs** — missing API.md / CHANGELOG / ARCHITECTURE / ADRs / .env.example.
4. **Discipline** — commit hygiene, branch protection signals, versioning,
   dead code, console.log in prod paths.
5. **UI/UX** — missing loading/empty/error states, a11y basics (alt, labels,
   focus), responsive smells, inline hex chaos, forms without pending states.
6. **Tokens** — AI context surface measured locally (gpt-tokenizer): bloated
   CLAUDE.md/.cursorrules, duplicated context, lockfiles not AI-ignored,
   estimated waste %.

Final output: six axis scores + one composite → README badge + radar chart
in the HTML report + trend history in `.pickcheck/history.json`.

## Why It Wins as Open Source

- **The playbook is the marketing.** `playbook/` chapters answer evergreen
  questions ("how do 100-dev orgs branch/review/version?") — shareable content
  that drives stars independent of the tool.
- **The rules are the community.** A rule = one folder with `rule.yaml` +
  `README.md` + fixtures. Contributing requires zero engine knowledge.
- **The auditor is the habit.** People run it weekly; the score trend makes it
  a fitness app for repos.
- **Dogfooding is the credibility.** pickcheck audits itself in CI on every PR
  and publishes its own score in the README.

## Non-Goals (v1)

- No LLM API calls inside the tool. Generators emit prompts; the user's own
  AI does the writing. Keeps it free, keyless, private.
- No web dashboard/SaaS. CLI + static HTML report + docs site only.
- No auto-fix that rewrites user code. We output findings + fix prompts;
  the human + their AI apply them.
- No Playwright/visual audit in v1 (roadmap: v2 `--visual` flag).

## North-Star User Stories

1. *Shipped-without-docs builder:* app is live, zero docs. `audit` → 31/100 →
   runs `gen api` + `gen changelog` → pastes prompts → handover-ready in an
   afternoon.
2. *Day-zero builder:* `init` before first feature → AI assistant inherits
   conventions from scaffolded context files → CI audit gate keeps score ≥ 90.
3. *Learner:* never installs anything; reads playbook chapters on GitHub;
   stars; returns when they need the tool.

## Name

**pickcheck** — npm package `pickcheck`, bin `pickcheck`, badge
"pickcheck score". Tagline candidates:
- "Ship like a 100-dev company. Alone."
- "The audit your AI forgot to run."
