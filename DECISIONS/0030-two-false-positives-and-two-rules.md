# ADR 0030 — Fixing the two false positives ADR 0029 found, and shipping the two rules that survived it

**Status:** accepted · **Date:** 2026-09-05

## Context

[ADR 0029](0029-corpus-confound-and-expansion.md) expanded the backtest
corpus from 8 repos to 13, filling the two empty cells of the
`category × stack` 2x2. It deliberately fixed nothing: mixing rule changes
into a corpus expansion would have made the findings diff un-attributable,
which is the one thing the corpus protocol exists to prevent. It left four
things on the table.

**Two false positives**, both control-repo alarms in EXECUTION.md's sense,
both the ADR 0027 drift class — a rule calibrated against Next.js meeting a
Vite repo for the first time:

1. `sec/no-hallucinated-imports` produced **1,666 findings on
   `buildship-ai/rowy`**, a human-built control. This is the ruleset's
   highest-severity rule (`error`, weight 4, and the trigger for the
   security gate that caps a composite at 59).
2. `docs/env-example-exists` produced **one finding on `cinnyapp/cinny`**,
   also a control.

**Two candidate rules** that survived the confound check at 100% accuracy
across all 13 repos and both strata — **B2** (framework-aware
typecheck-never-runs) and **C** (builder metadata) — against two that did
not (**A**/**A2** tsconfig strictness, **D** `any` density), which ADR 0029
killed.

## Decision

### 1. The manifest tier follows `extends` chains and honours `paths`

`rowy`'s `tsconfig.json` declares `"extends": "./tsconfig.extend.json"`,
and that file — not the one the engine read — declares
`paths: { "@root/*": ["../*"], "@src/*": ["./*"] }`. The tier read exactly
one config file deep, saw no `paths`, and read `@src/components/Button` as
an undeclared scoped npm package. ADR 0015 taught the tier about `baseUrl`;
nothing had taught it that a tsconfig can inherit.

`resolveBaseDir()` becomes `resolveTsconfig()`, returning both the resolved
`baseDir` and the `paths` patterns, with an `extends` walk behind it that
handles the string and array (TS 5.0) forms, relative and bare
(`node_modules`) targets, and cycles. Two details are load-bearing and are
enforced by tests:

- **A relative `baseUrl` resolves against the config that *declared* it,**
  not the one that inherited it. That is `tsc`'s rule, and getting it wrong
  silently points the resolver at the wrong directory.
- **A nearer config's `paths` replaces an inherited one wholesale.**
  `paths` is one compiler option, not a merged map.

**A specifier matched by a `paths` pattern is exempt without checking that
the target file exists.** This is deliberate and it is the crux of the
change. The rule's subject is supply chain: an undeclared specifier is an
`error` because a build resolves it against the npm registry, where an
attacker can publish the name. A path alias never reaches the registry —
the bundler rewrites it to a local file first — so it is out of scope
whether or not the file behind it is there. A broken alias is a build error
for `tsc` to report, not a security finding. This is the standard
`derivePackageName()` has always applied to `@/`-style aliases, which it
exempts on shape alone; following `extends` just means the tier now knows
which *other* aliases a project declared.

### 2. `docs/env-example-exists` ignores Vite's built-in `import.meta.env` set

`BASE_URL`, `MODE`, `PROD`, `DEV`, `SSR` join the `ignore` list — the whole
of Vite's injected set, not just the two `cinny` happens to read. They are
the same class the list already covers with `NODE_ENV` (RULESET.md §6) and
the `SUPABASE_*` triple (ADR 0027): values the platform supplies, that no
.env.example can meaningfully declare. The list had no Vite built-ins
because, when it was written, the corpus had no Vite repo whose author was
expected to get this right.

Like every entry in that list these match by **name, not access syntax**,
so a project that genuinely defines its own `process.env.BASE_URL` loses
the finding. That trade is not new — `PORT`, `HOST` and `SUPABASE_URL` are
all names a project could define — and it is the right way round: a
systematic false positive on every Vite app costs more than a rare false
negative on one name. Making it syntax-aware would mean a coverage-tier
schema change to distinguish `import.meta.env.MODE` from
`process.env.MODE`, which is not worth it for a `warn` at weight 2.

### 3. A new `capability` tier, for B2

B2's claim — *nothing in this repo will ever catch a type error* — is not
expressible in any existing tier. It is not about a file's content or
existence; it collects evidence from package.json scripts, CI
configuration, and framework config, ORs it together, and reports when the
OR is false. Per CLAUDE.md, that is a new tier and not a special case.

```yaml
tier: capability
pattern:
  reportAt: package.json
  providedBy:
    - { label: …, source: package-scripts, regex: … }
    - { label: …, source: files, files: […], regex: … }
    - { label: …, source: files, files: [next.config.*], revokedBy: … }
```

The generality that earns it a tier is the provider list, and the field
that earns it its keep is **`revokedBy`**: a guarantee a framework supplies
for free, which a config flag can silently switch back off. That is not
peculiar to typechecking — it is the shape of "is there a linter", "do
tests run in CI" — and it is precisely what ADR 0029 found the naive form
of this rule getting wrong.

`source: package-scripts` reads the `scripts` object rather than the raw
manifest, so an installed-but-unrun `vue-tsc` devDependency cannot vouch
for a check nothing performs. It matches against both a script's **name and
its command**, because `rowy` type-checks only as `"build": "tsc && vite
build"`, where the name says nothing.

### 4. `qual/no-typecheck-anywhere` ships (B2), warn, weight 3

Shipped as the framework-aware form, with the redefinition treated as the
substance of the rule rather than a detail. What earns it a place is not
the 100%: it is that the underlying claim is a real defect independent of
who wrote the code, and the framework-aware form is the only form that
states it correctly. Read without `revokedBy` it fires on **all four
Next.js controls**, and its accuracy drops from 100% to 69%.

### 5. `disc/builder-metadata-left-behind` ships (C), info, weight 1 — with four markers, not six

Shipped, and shipped **narrower than it was measured**. ADR 0029's detector
C carried six content markers; this rule carries four:

| Marker | Kind | Shipped |
|---|---|---|
| `lovable-tagger` in package.json | structural | yes |
| `gptengineer.js` script tag | structural | yes |
| v0's README sync line | structural | yes |
| unrenamed template package name | structural | yes |
| bare `lovable.dev`/`lovable.app` URL | prose | **no** |
| bare `v0.dev`/`v0.app` URL | prose | **no** |

The two URL markers are dropped because a README that *links* to a builder
is not a repo built by one — precisely the awesome-list/prompt-collection
population ADR 0029 found dominating the `v0-dev` and `bolt-new` topic
tags. Checking the evidence dump before deciding: **all seven AI-generated
repos already fire on a structural marker alone**, so the URL markers
contribute no discrimination and only false-positive surface. The rule is
7/7 vs 0/6 either way.

`.bolt/` and `.replit` are *directory* markers a content-matching regex
cannot see. They are omitted rather than guessed at, because no corpus arm
exists to calibrate them against.

The rule ships at `info`/weight 1 and its README states plainly that **it
is not evidence**: it separates the arms by reading the generator's
signature, so any argument of the form "AI repos score worse, and this rule
proves they're AI repos" is circular. It is a provenance label and a
tidiness finding.

### 6. A, A2 and D do not ship

Unchanged from ADR 0029. A's framework delta exceeds its generator delta
and it separates *backwards* within the Next stratum; D tops out at 77%
accuracy at any threshold.

## Results

### The two false-positive fixes

Corpus diff, hand-classified in full. Two repos moved; the other eleven
were byte-identical.

| Repo | Rule | Before | After | Removed |
|---|---|---|---|---|
| `rowy` (control/vite) | `sec/no-hallucinated-imports` | 1,666 | 37 | **−1,629** |
| `cinny` (control/vite) | `docs/env-example-exists` | 1 | 0 | **−1** |

**Precision on `sec/no-hallucinated-imports`, corpus-wide**, every finding
classified by hand against the repo's `package.json`:

| | Findings | True positives | False positives | Precision |
|---|---|---|---|---|
| Before | 1,668 | 22 | 1,646 | **1.3%** |
| After | 39 | 22 | 17 | **56.4%** |

Recall is unchanged: all 22 true positives survive, and no other repo's
findings moved. The 22 are `rowy`'s 20 phantom dependencies — `clsx`,
`react-transition-group`, `@mui/system`, `@emotion/cache` and
`@google-cloud/firestore`, all imported but declared only transitively,
plus `lodash` where the manifest declares `lodash-es` — and
`fin-bloom-dash`'s 2 imports of an undeclared
`lovable-agent-playwright-config`.

`cinny`'s finding read *"0% documented (0/1) — missing: MODE"*. Only `MODE`
was ever required: `BASE_URL` was already exempt, because
`usePathWithOrigin.ts` reads it as `import.meta.env.BASE_URL ?? ''` and the
rule's `optionalRegex` catches that repo-wide. Removing `MODE` empties the
required set. The rule's generator delta *improved* as a result, from
+0.40 to **+0.57**: it now fires on 0/6 controls instead of 1/6, with its
recall on the AI arm untouched.

### The scoring surprise: 1,629 findings removed, and `rowy`'s score does not move

`rowy` scored 47.58 before this change and scores **47.58 after**.

`PER_RULE_PENALTY_CAP` (ADR 0006) caps any single rule's contribution at 50
points no matter how often it fires. `sec/no-hallucinated-imports` at
`error` severity and weight 4 costs 25 × 4 = 100 raw for its *first*
finding, which is already over the cap. One finding and 1,666 findings cost
exactly the same.

So ADR 0029's statement that this rule "costs `rowy` 16.67 composite
points" was measured by excluding the rule **entirely**, and that number
does not describe what fixing the false positives recovers. With 20
genuine phantom dependencies still firing, the points stay spent — and
correctly so. What the fix buys is that the report is now readable: 77
findings instead of 1,706, with 20 real defects no longer buried under
1,629 aliases. **The README has been corrected accordingly**; the claim it
carried after ADR 0029 predicted a score recovery that did not happen.

### A third false-positive class, found by fixing the first

With the alias flood gone, the 37 remaining findings on `rowy` are legible,
and **17 of them are false positives of a class nobody had seen**: commented-out
example imports **inside template literals**.

```ts
slackMessage: `const extensionBody: SlackMessageBody = async({row, …}) => {
  // Import any NPM package needed
  // const lodash = require('lodash');
```

`rowy` ships an in-app code editor, and these are the sample snippets shown
to users. `stripComments()` is **not** at fault and was verified so: it
tracks quote state, so a `//` inside a backtick string is correctly left
alone — it is a string's contents, not a comment. The regex then matches
`require('lodash')` inside that string. All 17 sit inside template
literals; there are no other cases.

This is **not fixed here**, for the same reason ADR 0029 did not fix the
two above: it is a separate root cause needing a separate, attributable
diff. It is the next precision fix, and it is what stands between `rowy`
and a clean control score.

### The two new rules

Corpus diff: **19 findings added, on 7 repos, 0 on any control.** Every one
hand-classified against the repo's own files; **all 19 are true positives,
0 false positives.**

| Rule | ctl/next | ctl/vite | ai/next | ai/vite | gen Δ | frame Δ | Accuracy |
|---|---|---|---|---|---|---|---|
| `qual/no-typecheck-anywhere` | 0/4 | 0/2 | 3/3 | 4/4 | **+1.00** | +0.24 | **100%** |
| `disc/builder-metadata-left-behind` | 0/4 | 0/2 | 3/3 | 4/4 | **+1.00** | +0.24 | **100%** |

Both reproduce their pre-ship measurement exactly. The typecheck verdict
was verified individually for all 13 repos and is right for the right
reason in every case: the four Lovable apps have no typecheck at all; the
three v0 apps carry `ignoreBuildErrors: true`; the four Next controls are
covered by `next build`; `cinny` has `typecheck: tsc --noEmit`; and `rowy`
is caught only by matching a script's *command*, via `"build": "tsc && …"`.

The 12 builder-metadata findings are 7 unrenamed template package names
(`vite_react_shadcn_ts`, `my-v0-project`), 3 v0 README sync lines, 1
`gptengineer.js` script tag, and 1 further package.json marker.

### The corpus after all four changes

| Cell | n | Mean | Range |
|---|---|---|---|
| control/next | 4 | 80.19 | 76.42 – 86.11 |
| control/vite | 2 | 59.15 | 47.58 – 70.72 |
| ai-generated/next | 3 | 48.54 | 39.10 – 56.96 |
| ai-generated/vite | 4 | 48.38 | 37.63 – 55.64 |

Control mean 73.18 against the AI arm's 48.45, a gap that widened from
72.7 / 53.2. **Five of six controls now sit above every AI-generated
repo.** The single overlap is `rowy` at 47.58 — held there by 20 real
phantom dependencies and the 17 template-literal false positives above.

## Consequences

- **`rowy` is still a control-repo alarm.** It scores 47.58, far under the
  <75 threshold. Part of that is now known to be legitimate; the
  template-literal class is not, and neither is the ADR 0029 observation
  that the alarm threshold itself was calibrated on Next.js. Both remain
  open.
- **`ux/inline-hex-threshold` is still confounded** (+0.52 generator,
  +0.71 framework) and still shipped. ADR 0029 flagged it; nothing here
  changed it.
- **The precision fix did not move a score, and that is worth remembering
  when reading corpus deltas.** With a per-rule penalty cap, finding-count
  changes and score changes are only loosely coupled: a rule that goes from
  catastrophically noisy to accurate can leave the composite untouched.
  Report both numbers, never one as a proxy for the other.
- **Two rules now depend on generator-specific template defaults.**
  `ignoreBuildErrors: true` is a v0 default and the marker list names two
  builders. Both are honest at n=2 generators and neither generalises by
  assumption; a bolt.new or Replit arm would test both at once.
- **The `capability` tier has one rule.** A tier justified by one caller is
  a tier on probation. `revokedBy` is the part most likely to be reused;
  if the next capability rule doesn't need a provider list, this should
  collapse back into something smaller.
