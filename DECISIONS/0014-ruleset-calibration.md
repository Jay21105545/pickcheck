# ADR 0014 — First real-world ruleset calibration: methodology, results, and the `ux/hardcoded-px-width` pull

**Status:** accepted · **Date:** 2026-09-03

## Context
EXECUTION.md's Stress-Test & Backtest Protocol has stood since Phase 1
("Control-repo alarm: if a well-engineered control repo scores < 75,
treat as a false-positive bug in a rule, not a finding") but had never
actually been run against real code for the Phase-3 UI/UX and tokens
rules — their fixture suites only prove a rule behaves as *designed*
against synthetic samples, not that the design itself is precise against
real, messy, real-world source. The fresh `create-next-app` starter used
at Phase-3 ship time (see the CHANGELOG entry / prior session) has no
data fetching, forms, or destructive actions at all, so it validated
nothing about `ux/*`'s actual precision — a genuine gap this record
closes.

## Methodology
Four real, actively-maintained repos, chosen specifically for having the
UI shapes the Phase-3 rules target (none of which the create-next-app
starter has): [shadcn-ui/taxonomy](https://github.com/shadcn-ui/taxonomy)
(auth, dashboard, post CRUD, delete flows), [nextjs/saas-
starter](https://github.com/nextjs/saas-starter) (team dashboard, Stripe,
sign-out), [vercel/commerce](https://github.com/vercel/commerce) (Shopify
storefront — product fetching, cart mutations, search, filters), and
[steven-tey/precedent](https://github.com/steven-tey/precedent) (SaaS
starter kit — the closest available proxy for "template-ish, commonly
forked as an AI-assisted-build base"). Shallow-cloned, ran `pickcheck
audit --json --rules-dir packages/rules` against each, filtered findings
to `ux/*`/`tok/*` by id prefix, and **hand-read every single finding**
against its real source (37 findings, 100% reviewed — not sampled) —
classifying each TRUE POSITIVE (a senior reviewer would flag this),
FALSE POSITIVE (the rule is wrong here), or ARGUABLE (defensible either
way, real mitigating context).

## Round 1 results (before this record's fixes)

| Rule | Findings | TP | FP | Arguable | Precision (excl. arguable) |
|---|---|---|---|---|---|
| `tok/ai-ignore-coverage` | 4 | 4 | 0 | 0 | 100% |
| `ux/input-missing-label` | 4 | 2 | 2 | 0 | 50% |
| `ux/onclick-non-interactive` | 2 | 1 | 1 | 0 | 50% |
| `ux/form-submit-no-pending` | 4 | 2 | 1 | 1 | 67% |
| `ux/hardcoded-px-width` | 19 | 3 | 14 | 2 | **18%** |
| `ux/fetch-missing-states` | 1 | 0 | 1 | 0 | 0% (n=1) |
| `ux/inline-hex-threshold` | 3 | 0 | 2 | 1 | 0% (n=3) |
| `ux/img-missing-alt` | 0 | — | — | — | no signal (2 true negatives observed) |
| `ux/destructive-no-confirm` | 0 | — | — | — | no signal (1 true negative observed) |
| `tok/context-file-budget` | 0 | — | — | — | no applicable files (no repo ships a context file) |
| `tok/context-duplication` | 0 | — | — | — | no applicable files |

Aggregate across rules with findings: 12 TP / 21 FP / 4 arguable = **36%
precision** excluding arguable.

Root causes, by rule:

- **`ux/hardcoded-px-width`** — three distinct, compounding regex bugs:
  (1) no word boundary before `width`, so `min-width:`/`max-width:`
  (inside Next.js `<Image sizes="(min-width: 1024px) 20vw, ...">` hints —
  a *correct* responsive pattern) matched as a bare `width:` declaration,
  7 of 19 findings; (2) the same missing-boundary bug against Tailwind's
  `max-w-[Npx]` (also a correct pattern — an upper bound, not a fixed
  width), 4 of 19; (3) breakpoint-variant prefixes (`sm:w-[350px]`,
  `md:w-[390px]` — "full width on mobile, fixed above the breakpoint," the
  *recommended* Tailwind idiom) not recognized at all, 4 of 19. Its own
  README had already *claimed* `min-width`/`max-width` weren't matched —
  the implementation didn't match its documented intent, and no fixture
  happened to exercise a `sizes` attribute or a real `max-width` to catch
  the drift.
- **`ux/input-missing-label`** — both false positives were the identical
  shadcn/ui `<Input>` primitive (`<input {...props} />`), in two
  unrelated repos. `ux/img-missing-alt` already exempts spread-prop
  elements for the same reason; this rule simply never got the matching
  clause.
- **`ux/form-submit-no-pending`** — a sign-out button (no real double-
  submit consequence) flagged the same as a cart-mutation button (real
  consequence); the rule couldn't distinguish stakes.
- **`ux/fetch-missing-states` / `ux/inline-hex-threshold`** — both single-
  or few-finding false positives traced to Next.js's special convention
  files (`opengraph-image.tsx`, rendered via the edge runtime with no
  "user watching a loading state" concept) and, for the hex rule,
  third-party brand-icon SVGs (Google's and Buy Me a Coffee's official
  logo colors — externally mandated, not this app's design tokens
  drifting).
- **`ux/onclick-non-interactive`** — the one false positive was a
  `<div onClick>` wrapper around already-keyboard-focusable `<Link>`
  children (a click-anywhere-to-close convenience, not the sole
  interactive surface) — a case that needs dataflow/tree reasoning this
  tier honestly doesn't attempt.

## Decision
Per-rule, all four fixable classes were fixed; the one structurally
unfixable-at-this-tier rule was pulled:

1. **`ux/hardcoded-px-width` → `packages/rules/_incubating/`.** 18%
   precision, and none of the three bugs is a one-line fix that leaves
   the rule trustworthy — a regex tier can't represent "not preceded by
   `min-`/`max-`/a breakpoint variant" robustly against patterns this one
   sample didn't happen to exercise (CSS `grid-template-columns`,
   arbitrary non-width utilities containing `width` as a substring,
   etc.). `loadRules()` (`packages/cli/src/engine/loader.ts`) now ignores
   `**/_incubating/**`, so a parked rule's `rule.yaml`/README/fixtures
   stay in the tree — resumable, not deleted — but never load into a live
   audit. The fixture test harness still discovers and validates it (a
   parked rule with broken fixtures would be useless to whoever resumes
   it); only the *loader* excludes the directory. `instruction/
   RULESET.md` and `instruction/ARCHITECTURE.md` both note the
   convention. Recommended next step, recorded in the rule's own README:
   rewrite as `astgrep` tier, which can structurally distinguish a bare
   `w-[Npx]` from one prefixed by `max-` or a breakpoint variant, the
   same way `ux/img-missing-alt`/`ux/input-missing-label` already
   structurally handle spread props rather than regex-guessing at them.
2. **`ux/input-missing-label`** gained the same spread-element exemption
   `ux/img-missing-alt` already had.
3. **`ux/fetch-missing-states`** and **`ux/inline-hex-threshold`** both
   gained `files` exclusions for Next.js's special convention files
   (`opengraph-image`, `twitter-image`, `icon`, `apple-icon`); the hex
   rule additionally excludes `**/icons/**`, `**/logos/**`, `**/brand/**`.
4. **`ux/form-submit-no-pending`** gained a sign-out/log-out exemption:
   checks the button's own `aria-label` and, via `inside: {kind:
   jsx_element, has: {stopBy: end, regex: ...}}`, its rendered text
   anywhere in its subtree (covers icon+label shapes like
   `<LogOut /><span>Sign out</span>`, not just a bare text child).
5. **`ux/onclick-non-interactive`** was left unchanged — n=2 is too small
   to act on, and the false-positive pattern (wrapper around otherwise-
   focusable children) needs real dataflow analysis to fix generically,
   which this tier honestly doesn't attempt (same tradeoff already
   documented in its README's known limits).

Every fixed false-positive pattern got a new `fixtures/good/` sample
built from the real shape that triggered it (the shadcn Input primitive,
`opengraph-image.tsx`, a brand-icon SVG, the icon+span sign-out button) —
not a paraphrase, so the exact regression can't silently return.

## Round 2 results (after the fixes, same 4 repos, same methodology)

| Rule | Findings | TP | FP | Arguable | Precision (excl. arguable) |
|---|---|---|---|---|---|
| `tok/ai-ignore-coverage` | 4 | 4 | 0 | 0 | 100% |
| `ux/input-missing-label` | 2 | 2 | 0 | 0 | 100% |
| `ux/form-submit-no-pending` | 3 | 2 | 0 | 1 | 100% |
| `ux/onclick-non-interactive` | 2 | 1 | 1 | 0 | 50% (unchanged, untouched) |
| `ux/fetch-missing-states` | 0 | — | — | — | no findings (the only FP is now excluded) |
| `ux/inline-hex-threshold` | 0 | — | — | — | no findings (all 3 FP/arguable now excluded) |
| `ux/hardcoded-px-width` | — | — | — | — | parked, not shipped |

11 total `ux/*`/`tok/*` findings (down from 37), every one previously-
classified false positive gone, every previously-classified true positive
still present unchanged. Aggregate precision across rules with findings:
9 TP / 1 FP / 1 arguable = **90%** excluding arguable (up from 36%).

Per-repo score movement: `saas-starter` 68.53 → 72.98, `precedent`
79.64 → 84.64. `taxonomy` and `commerce` stayed pinned at composite 59 in
both rounds — not because nothing improved (their `ui-ux` category score
moved from 35.71/22.73 to 71.43/29.41 respectively), but because both
already had an error-severity security finding independently triggering
`SCORING_GATES`' composite cap of 59 (DECISIONS/0006/0009) — the gate is
working as designed, just orthogonal to this record.

## Consequences
- This is the Stress-Test & Backtest Protocol's first real execution
  against the Phase-3 ruleset, and the first time a shipped rule has been
  pulled post-launch on precision grounds — establishes the pattern
  (`_incubating/`, loader exclusion, README documenting *why*) for any
  future rule that calibrates badly.
- `ux/onclick-non-interactive`'s one remaining known false-positive class
  (wrapper divs around focusable children) is unresolved by design — flagged
  here for whoever next has a larger real-world sample to recalibrate against,
  rather than guessed at from n=2.
- `tok/context-file-budget` and `tok/context-duplication` still have zero
  real-world validation — none of the four sampled repos ships an AI
  context file at all. Re-validate against repos that actually maintain
  one before trusting their precision.
- `ux/fetch-missing-states` and `ux/inline-hex-threshold` now have zero
  real-world *true positives* observed in this sample either (their only
  findings were the now-excluded false positives) — the fixes are well-
  evidenced for what they exclude, but recall against a genuine violation
  is untested here.
