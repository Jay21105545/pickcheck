# ADR 0017 — `disc/no-console-log`: exempt files that are a direct package.json script execution target

**Status:** accepted · **Date:** 2026-09-03

## Context

Hand-verifying `saas-starter`'s remaining findings after DECISIONS/0015/
0016 (its composite, 73.15, was the only control still short of the 75
control-repo bar) found 35 of its 36 `disc/no-console-log` findings were
false: `lib/db/setup.ts` (31) and `lib/db/seed.ts` (4) are one-off developer
CLI scripts — `lib/db/setup.ts` runs interactive `readline` prompts and
shells out to the Stripe CLI, `lib/db/seed.ts` is a self-invoking
`seed().catch(...).finally(...)` at module scope — invoked only via
`package.json`'s `"db:setup": "npx tsx lib/db/setup.ts"` / `"db:seed": "npx
tsx lib/db/seed.ts"`, never imported by application code. Every
`console.log` in both files is the script's entire purpose (progress
output to a developer's terminal), not debug litter left in production
code. The remaining 1/36 (`app/api/stripe/webhook/route.ts:30`, inside a
real Next.js route handler executed on every webhook call) is a genuine
finding.

The rule already excludes `**/scripts/**` — but that's a *directory-name*
convention, and this is a different, equally common one: Drizzle/Prisma-
ecosystem projects (of which `nextjs/saas-starter` is the official
Vercel-maintained example) conventionally put setup/seed scripts under
`lib/db/` or `db/` instead, keyed to database tooling rather than
"scripts" as a location. Extending `files` with more directory guesses
(`!**/db/setup.*`, `!**/db/seed.*`, …) would repeat the same overfit-to-
one-sample mistake DECISIONS/0015 explicitly avoided for baseUrl
resolution: the real, generalizable signal isn't the directory or the
filename, it's that the file is **executed directly by a package.json
script** — the same structural fact a directory named `scripts/` is only
ever a proxy for.

## Decision

Add a new, tier-agnostic, opt-in rule precondition: `excludePackageScriptTargets:
boolean` on `baseRuleSchema` (`packages/rules/schema.ts`) — sibling to
`files`, not nested inside any one tier's `pattern` (which, for `astgrep`,
is an opaque passthrough to `@ast-grep/napi` that pickcheck's schema
doesn't interpret at all, so this couldn't live there). When set,
`dispatchTier()` (`packages/cli/src/engine/tiers/index.ts`) computes the
set of repo-root-relative files that are the direct execution target of
any `package.json` `scripts` entry among the scanned files
(`engine/package-scripts.ts`'s new `computePackageScriptTargets()`) and
filters them out of `ctx.scannedFiles` *before* routing to the rule's
tier — a single choke point, since every tier independently derives its
own `micromatch(ctx.scannedFiles, rule.files, …)` matches from that same
list. This is new engine capability, not a rule-specific special case, per
CLAUDE.md — the same category of addition ADR 0015's baseUrl resolution
and ADR 0016's ignore-coverage move already were.

`computePackageScriptTargets()`: for every `package.json` among
`scannedFiles` (not just the repo root — a workspace package's own scripts
count too), reads its `scripts` values, tokenizes each command string
(whitespace/quote-aware, not a full shell parse), and keeps tokens
matching `^[.\w][\w./-]*\.(ts|tsx|js|jsx|mjs|cjs)$` — a whole token that
looks like a relative path ending in a JS/TS extension. That character
class deliberately excludes commas, so a flag value like `eslint . --ext
.ts,.tsx` can't be mistaken for a file (the class can't consume the comma,
so the required trailing extension never lines up with the end of the
token) — an earlier draft of this regex prefixed every token with a
synthetic `/` to require "path-like," which accidentally defeated its own
purpose (every token trivially "contains" the synthetic slash); caught and
fixed via the `--ext .ts,.tsx` fixture case before this shipped. Each
matched token resolves relative to *its own* `package.json`'s directory
(where `npm run` actually executes from), not the scanned root.

`disc/no-console-log`'s `rule.yaml` sets `excludePackageScriptTargets:
true`; the existing `!**/scripts/**` glob exclusion is unchanged — the two
mechanisms are complementary (directory convention vs. execution-target
fact), not a replacement of one by the other.

Fixture coverage: `fixtures/good/package.json` + `lib/db/setup.ts` (the
readline-prompt shape) + `lib/db/seed.ts` (the self-invoking shape), both
copied from saas-starter's real structure; `fixtures/bad/package.json`
with `scripts` that reference *neither* of the existing bad-fixture files
(and include the `--ext .ts,.tsx` flag-value case) — a regression guard
proving a present `package.json` doesn't create a blanket exemption.

## Consequences

- `saas-starter`: `discipline` category unaffected by *this* fix alone in
  the direction hoped (it now has exactly one real finding —
  `disc/no-console-log` on the webhook route — down from 36, but one
  weight-1 warn finding still costs the same capped-below-100 penalty a
  single finding always does under DECISIONS/0009's curve; see the
  re-run corpus table for the actual composite movement).
- `qual/fetch-has-error-handling`'s 3 findings on `saas-starter` (the
  standard SWR `const fetcher = (url) => fetch(url).then(res =>
  res.json())` idiom) were also hand-reviewed and left **unchanged**: they
  are true positives — `fetch` doesn't reject on a non-2xx response, so a
  404/500 JSON error body is returned as if it were valid data, exactly
  the gotcha the rule's README describes. Real, if widely-copied, even in
  an official template.
- `excludePackageScriptTargets` is available to any rule/tier, not just
  this one — a future rule (e.g. a hypothetical "hardcoded secret in a
  script" carve-out) can opt in the same way, or a rule can combine it
  with its own `files` exclusions freely; the two compose via simple set
  subtraction, no interaction effects.
- Known limit, same shape as `sec/no-hallucinated-imports`' comment-
  blindness before DECISIONS/0015: the script-command tokenizer is a
  regex over whitespace/quotes, not a real shell parser — a script that
  builds its target path via shell substitution (`` node `pwd`/seed.ts ``)
  or an env var (`node $SCRIPT_DIR/seed.ts`) won't be recognized. Accepted
  as out of scope for the same reason a full shell parser is out of scope
  for a lightweight static-analysis tool; revisit only if real-world
  review turns up a repo actually shaped that way.
