# ADR 0029 — The corpus couldn't tell "AI-written" from "Vite SPA": a 2x2 expansion, and what it did to four candidate rules

**Status:** accepted · **Date:** 2026-09-05

## Context

[ADR 0014](0014-ruleset-calibration.md) measured the ruleset's **precision**
and [ADR 0027](0027-recall-drift-in-shipped-rules.md) measured its
**recall**, both against the 8-repo corpus. ADR 0027 also named the reason
four rules had drifted: they were "calibrated on half the world" — the
Next.js half — because every control repo was a Next.js app.

That observation has a sharper form, and it invalidates more than four
rules. In the 8-repo corpus:

| | Next.js | Vite + React |
|---|---|---|
| **control** | taxonomy, saas-starter, commerce, precedent | *(empty)* |
| **AI-generated** | *(empty)* | sports-on-the-go, fin-bloom-dash, shelfly-creator-hub, mindtrack |

`category` and `stack` were **perfectly correlated**. Every measurement of
the form "this signal separates AI-generated repos from human-built ones"
was, on that corpus, numerically identical to "this signal separates Vite
SPAs from Next.js apps." The corpus could not distinguish the two claims,
so no amount of care in reading it could either. Any separator scoring 100%
was scoring 100% on both hypotheses simultaneously.

This matters most for the four signals a recall pass had flagged as clean
separators and proposed as new rules:

- **A — tsconfig strictness.** TypeScript strictness is switched off.
- **B — typecheck-never-runs.** Nothing in the repo ever type-checks it.
- **C — builder metadata.** The generator's fingerprints are still in the
  tree (`lovable-tagger`, a `gptengineer.js` script tag, a v0 sync README).
- **D — `any` density.** `any` per thousand source lines above a threshold.

All four separated the two arms perfectly. All four were also plausible
consequences of the *template* rather than the *author* — the Lovable
`vite_react_shadcn_ts` starter ships a deliberately lax `tsconfig`, and no
Vite app gets a typecheck for free the way `next build` gives one. Shipping
them on the strength of an 8-repo run would have been shipping four
framework detectors labelled as provenance detectors.

## Options considered

### How to break the correlation

1. **Re-label the existing corpus.** Cheap and useless: the repos are what
   they are, and the confound is a property of the sample, not the labels.
2. **Generate the missing cells ourselves** — run Lovable/v0 on a spec, or
   hand-write a "professional" Vite SPA. Rejected: repos we author are
   repos we author *knowing what is being measured*, which is the one thing
   a control must not be. The existing arms are real third-party work and
   the new arms have to be too.
3. **Stratify statistically without new data.** Impossible — with two
   empty cells there is nothing to stratify over.
4. **Fill the two empty cells with real, pinned, third-party repos.** The
   only option that answers the question. Chosen.

### What counts as "AI-generated" for the new cell

The existing arm's evidence was the `lovable-dev` GitHub topic — an
author-set label, and a weak one. Adding a second generator meant deciding
what evidence is good enough, and the honest answer had to be **measurable
and fixed before any repo was audited**, or the whole exercise collapses
into picking repos that give the answer we want.

Three candidate standards:

1. **Topic tags** (`topic:v0-dev`, `topic:bolt-new`). Measured: 29 and 49
   repos respectively, dominated by prompt collections, awesome-lists and
   tools *about* the builders rather than output *from* them. Author-set,
   unverifiable, and mostly wrong. Rejected as the sole criterion.
2. **A generator marker in the tree** — the v0 GitHub integration writes
   `*Automatically synced with your [v0.app](https://v0.app) deployments*`
   into the README, Lovable writes `lovable-tagger` into `devDependencies`.
   Strong evidence the repo *started* as generator output. Says nothing
   about how much of it still is.
3. **Marker plus a measured share of commits authored by the generator's
   own account.** The `v0` and `lovable-dev[bot]` GitHub accounts author
   commits under their own identity, so the ratio is directly countable.

Standard 3 was chosen, with the threshold calibrated to the arm already in
the corpus rather than picked to be convenient. Measured over the existing
four: 97%, 95%, 100%, 72% bot-authored. **The floor is 72%, so the
inclusion threshold is ≥70%.**

That threshold has teeth, and it cost a repo we wanted. `Likheet/hermes-monitoring`
is a v0-seeded Next.js app with 202 source files, 35 pages and 17 API
routes over Supabase — by far the best *shape* match for the Lovable arm.
It is **34%** v0-authored (62 of 100 sampled commits are the human owner's,
4 are `claude`'s). It was excluded. Recording that here because the
temptation to take it was real and the number is the only thing that
stopped it.

## Decision

### 1. The corpus is a 2x2, and `repos.json` says so

Two new fields on every entry, and `run.ts`'s `CorpusRepo` type:

- **`stack`** (`"next" | "vite"`) — so the correlation that made this ADR
  necessary is visible in the data rather than latent in it.
- **`provenance`** — the marker *and* the measured commit share, per repo.
  "Lovable-generated" was an assertion; "97/100 commits authored by
  `lovable-dev[bot]`" is a claim someone can check.

### 2. Five repos added, filling both empty cells

**AI-generated + Next.js (v0.app), n=3.** Selection criteria, fixed before
any audit ran: the v0 GitHub-sync README line; `next` in `dependencies`;
≥70% of commits authored by the `v0` account; and an application shape
matched to the Lovable arm (multi-page, with a data layer), not a landing
page or a visual demo.

| Repo | v0 commits | Shape |
|---|---|---|
| `Gnaneswar22/ai-career-assistant` @ `4737a76` | 2/2 (100%) | 10 pages, 9 API routes, 38 source files |
| `Tirth1107/THEGHOST` @ `e533713` | 16/17 (94%) | 11 API routes over Supabase + Neon, 35 source files |
| `oakghana/newattendanceapp` @ `f00f73d` | 95/100 (95%) | 70 pages, 260 API routes, Supabase, 689 source files |

**Control + Vite/React SPA, n=2.** Criteria, likewise fixed in advance and
deliberately **independent of every rule under test**: no generator marker
anywhere in the tree; a maintaining team or company rather than one person;
sustained history over more than a year; a single-root Vite + React +
TypeScript SPA against a hosted backend — the closest available structural
analogue to a Lovable app, differing only in who wrote it. Neither repo's
`tsconfig`, CI configuration, nor `any` usage was inspected before pinning.

| Repo | Signals | Shape |
|---|---|---|
| `cinnyapp/cinny` @ `e046757` | 3.9k stars, 575 forks, team-maintained since 2021 | Matrix client, 769 source files |
| `buildship-ai/rowy` @ `a5b4316` | 6.8k stars, 557 forks, company-built product | Firestore admin UI over a BaaS, 657 source files |

`excalidraw/excalidraw` was the obvious third control and was **rejected**:
it is a workspaces monorepo, which introduces repo *shape* as a third
uncontrolled variable next to the two this record exists to separate.

The resulting corpus is 4 / 2 / 3 / 4 across the four cells. The imbalance
is deliberate — `newattendanceapp` was added specifically because at 689
source files it is size-matched to the two professional Vite SPAs, which
otherwise would have made "large" and "professionally built" a *new*
correlation in place of the old one.

### 3. `corpus/separators.ts`, and why the candidates are not rules

`pnpm corpus:separators` measures both halves of the question: a 2x2 of
which cells each **shipped** rule fires in, and the four **candidate**
detectors A–D run directly against the checkouts.

The candidates deliberately do **not** live in `packages/rules/`. A
`rule.yaml` is a shipping decision; the point of this exercise is to make
the measurement available *before* that decision, so a candidate can be
killed without ever having had fixtures written for it. Three of the four
were killed. None shipped in this session.

The number the tool leads with is the **stratified** one — does the signal
still separate AI from control with the stack held fixed? — because the
headline accuracy is exactly the number the old corpus could not be trusted
to produce.

### 4. Snapshots are excluded from `biome check`

`corpus/snapshots/rowy.json` is 1.0 MiB and trips biome's file-size
warning. Snapshots are machine-written audit output, not authored source;
`!corpus/snapshots` in `biome.json`'s `files.includes` says so. (The
alternative, raising `files.maxSize`, would silently raise it for real
source too.)

## Results

### The corpus re-run

All eight pre-existing repos: **zero diff**, byte-identical snapshots.
Audits are per-repo and independent, so adding repos cannot move an
existing one — this was verified rather than assumed. Five new baselines
seeded.

| Cell | Repos | Composite range | Mean |
|---|---|---|---|
| control/next | 4 | 76.42 – 86.11 | 80.19 |
| control/vite | 2 | 47.58 – 68.08 | 57.83 |
| ai-generated/next | 3 | 40.44 – 65.91 | 54.95 |
| ai-generated/vite | 4 | 40.51 – 59.00 | 51.81 |

**The clean composite separation did not survive.** On the old corpus every
control outscored every AI-generated repo. On the expanded corpus `rowy`
(47.58) sits below five of the seven AI-generated repos. Even after
discounting the false-positive cluster described below — `rowy` scores
**64.25** with `sec/no-hallucinated-imports` excluded — it still sits below
`theghost` (65.91). The best single composite cutoff now misclassifies one
of thirteen repos (92%), where the old corpus gave a perfect split.

### The four candidates

Every number below is from `pnpm corpus:separators`. "Generator delta" is
fire-rate(AI) − fire-rate(control); "framework delta" is
fire-rate(vite) − fire-rate(next).

| | ctl/next | ctl/vite | ai/next | ai/vite | gen Δ | frame Δ | Accuracy | Verdict |
|---|---|---|---|---|---|---|---|---|
| **A** tsconfig strictness (soundness flags) | 1/4 | 0/2 | 0/3 | 4/4 | +0.40 | **+0.52** | 69% | **drop** |
| **A2** … + hygiene flags | 1/4 | 1/2 | 0/3 | 4/4 | +0.24 | **+0.69** | 62% | **drop** |
| **B** typecheck-never-runs, as specified | 4/4 | 0/2 | 3/3 | 4/4 | +0.33 | −0.33 | 69% | **drop as specified** |
| **B2** typecheck-never-runs, framework-aware | 0/4 | 0/2 | 3/3 | 4/4 | **+1.00** | +0.24 | **100%** | **ship** |
| **C** builder metadata | 0/4 | 0/2 | 3/3 | 4/4 | **+1.00** | +0.24 | **100%** | ship, with a caveat |
| **D** `any` density | — | — | — | — | — | — | **77% at best** | **drop** |

**A — tsconfig strictness: drop.** Its framework delta exceeds its
generator delta, and the stratified view is fatal. Within Vite it separates
(AI 4/4, control 0/2). Within Next it separates *backwards*: the only repo
that fires is a **control**, `shadcn-ui/taxonomy`, which ships
`"strict": false`, while all three v0-generated Next apps ship
`"strict": true`. The four Lovable repos carry byte-identical
`tsconfig.app.json` settings — `noImplicitAny: false`,
`strictNullChecks: false`, `noUnusedLocals: false`,
`noUnusedParameters: false` — which is the `vite_react_shadcn_ts` starter
verbatim. The signal is one template's defaults, not a property of machine
authorship. Widening it to hygiene flags (A2) makes it worse, because it
then also fires on `rowy`, which sets `noUnusedLocals: false` on top of
`strict: true`.

**B — typecheck-never-runs: drop as specified, ship redefined.** As
originally stated ("no typecheck script and no CI typecheck") it fires on
**all four Next.js controls**, because `next build` type-checks and none of
them need a separate script. Within the Next stratum it has zero
discriminating power: AI 3/3, control 4/4. Its framework delta is
*negative*.

Crediting the framework's own typecheck — `next build` fails on type errors
unless `typescript.ignoreBuildErrors` switches that off — turns it into the
only candidate that separates perfectly **within both strata**: AI 3/3 vs
control 0/4 in Next, AI 4/4 vs control 0/2 in Vite. All three v0 apps carry
`typescript: { ignoreBuildErrors: true }` in `next.config.mjs`; none of the
four Next controls does. On the Vite side, `cinny` has a
`typecheck: tsc --noEmit` script and `rowy` runs `tsc &&` inside its build,
while no Lovable app type-checks at all.

The recommendation is **ship, as B2** — with the redefinition treated as
the substance of the rule, not a detail. What earns it a place is not the
100%: it is that the underlying claim, *nothing in this repo will ever
catch a type error*, is a real defect independent of who wrote the code,
and the framework-aware form is the only form that states it correctly.
Two honest limits: `ignoreBuildErrors: true` is itself a **v0 template
default**, so on the Next side this is one generator's default measured
three times; and the "consistent across generators" argument rests on n=2
generators. A third builder could break it.

**C — builder metadata: ships, but it is not evidence.** Perfect in both
strata, 7/7 versus 0/6, and it is the only candidate with no framework
story at all — it fires on v0's README line and Lovable's `lovable-tagger`
alike. It is also **circular by construction**: it separates AI from
control because it reads the generator's signature. Any claim of the form
"AI-generated repos score worse, and look, this rule proves they're
AI-generated" is question-begging if it leans on this rule. It is a
provenance label, and a `discipline`-severity tidiness finding
("un-renamed template scaffolding is still in your repo"); it is not
evidence about code quality. It is also trivially defeated by deleting one
README line, and silently blind to every builder not in its marker list.

**D — `any` density: drop.** No threshold works. The full sweep tops out at
**77% accuracy**, and the best cutoff (≥1.0 per kloc) misclassifies three
of thirteen repos. `rowy` — a company-built control — carries **8.90**
`any` per kloc, higher than six of the seven AI-generated repos.
`shelfly-creator-hub` — pure Lovable output — carries **0.00**. The ranges
overlap almost completely (AI 0.00–13.23, control 0.00–8.90). On the old
corpus this looked like a separator only because the Lovable arm's 0.00–2.79
band happened to sit above the Next.js controls' 0.00–1.42 band, and both
bands are noise.

### Two shipped rules the expansion caught

Both are **control-repo alarms** in EXECUTION.md's sense (protocol item 3),
and both are exactly the ADR 0027 drift class — a rule calibrated against
Next.js meeting a Vite repo for the first time.

1. **`sec/no-hallucinated-imports`: 1,666 false positives on `rowy`,**
   1,655 of them `@src/*` and `@root/*` specifiers. `rowy`'s
   `tsconfig.json` declares those aliases via
   `"extends": "./tsconfig.extend.json"`, and the manifest tier does not
   follow `extends` — so it sees no `paths` and reads `@src/components` as
   an undeclared scoped npm package. ADR 0015 taught the tier about
   `baseUrl`; nothing taught it that a tsconfig can inherit. This single
   rule costs `rowy` **16.67 composite points** (47.58 → 64.25 with the
   rule excluded). The remaining 11 findings are genuine: `rowy` declares
   `lodash-es` but imports from `lodash`.

2. **`docs/env-example-exists`: a false positive on `cinny`.** Cinny reads
   exactly two env keys — `import.meta.env.BASE_URL` (8×) and
   `import.meta.env.MODE` (1×). Both are **injected by Vite itself**,
   precisely analogous to the `NODE_ENV` that RULESET.md §6 already
   excludes and to the `SUPABASE_*` keys ADR 0027 put in the rule's
   `ignore` list. The list has no Vite built-ins because, when it was
   written, the corpus had no Vite repo whose author was expected to get
   this right.

Neither is fixed here. Both are engine/rule changes that would move the
corpus, and mixing them into this session would make the findings diff
un-attributable — the one thing the corpus protocol exists to prevent.
They are seeded into the baseline as they stand, so the fix will show up as
a clean `-1666` / `-1` diff.

### One shipped rule that was already confounded

**`ux/inline-hex-threshold` was a perfect separator on the old corpus** —
4/4 AI-generated, 0/4 control — and the expansion broke it. It now fires on
**both** professional Vite SPAs, and its framework delta (+0.71) exceeds
its generator delta (+0.52). It is the same class of signal as candidate A,
already shipped: Next.js apps in this corpus put their palette in a
Tailwind config, Vite SPAs put hex literals in theme and CSS-in-TS modules.
Flagged for a precision review of its own; not changed here.

For contrast, the rule the expansion **strengthened** is
`sec/post-has-validation`: 5/7 AI-generated, 0/6 control, generator delta
+0.71 against a framework delta of −0.10, and it fires on all three of the
new v0 Next apps. That is what a provenance-bearing rule looks like when
the confound is removed.

## Consequences

- **The README's corpus claim was falsified and has been corrected.** It
  said "every control repo separates cleanly above every AI-generated one"
  and listed all four AI repos at 59. Neither is true now: the AI arm
  spans 40.44–65.91, and `rowy` scores below most of it. The corrected
  table shows the 2x2 and states the overlap. A claim the corpus no longer
  supports is not one to leave in a README because it reads well.
- **The control-repo alarm threshold (<75) was calibrated on Next.js.**
  Both new controls fall below it — 68.08 and 64.25 after discounting the
  known false positives. Either professional Vite SPAs genuinely score
  worse under this ruleset, or the scorer's applicable-rule denominator
  behaves differently for them. That needs its own investigation; it is not
  something to resolve by moving the threshold.
- **Two empty cells were the confound; two thin cells are the residue.**
  n=2 and n=3 are enough to *falsify* a perfect separator — one
  counterexample does that — and too thin to confirm one. B2 and C are
  reported as 100% on 13 repos, not as established facts.
- **The AI-generated arm now spans two generators, and the controls two
  frameworks; neither spans three.** Every conclusion here is conditioned
  on Lovable and v0. A bolt.new or Replit arm is the obvious next
  expansion, and the `provenance` field is shaped to take it.
- **The `≥70% generator-authored commits` threshold is now the corpus's
  admission standard,** and CONTRIBUTING.md documents it. It is derived
  from the existing arm's floor, so it will need restating — not silently
  relaxing — if a future generator commits differently.
- **A naive JSONC comment-stripper cannot read a Next.js `tsconfig.json`.**
  `/\*.*?\*/` opens on the `/*` inside `"@/*": ["./*"]` and closes on the
  `*/` inside `"**/*.ts"`, deleting the middle of the file. It made six of
  thirteen repos read as "has no tsconfig" in the first run of this
  analysis, and every one of those was a *false negative* on candidate A —
  the failure mode that flatters the hypothesis. The engine's own
  `engine/strip-comments.ts` was checked and is **not** affected: it is a
  character scan that tracks quote state, so `"@/*"` is inside a string and
  never opens a comment. `separators.ts` now does the same thing. Worth
  recording as a near-miss rather than a bug: the analysis tool nearly
  produced a confidently wrong answer using a technique the engine had
  already rejected, two ADRs ago, for the same reason.
