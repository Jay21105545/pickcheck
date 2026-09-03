# ADR 0015 — `sec/no-hallucinated-imports`: three manifest-tier false-positive fixes from corpus review

**Status:** accepted · **Date:** 2026-09-03

## Context

EXECUTION.md's Stress-Test & Backtest Protocol item 3 ("control-repo alarm:
if a well-engineered control repo scores < 75, treat as a false-positive
bug in a rule, not a finding") flagged that three of the four control repos
in `corpus/repos.json` (`taxonomy`, `commerce`, `saas-starter`) were scoring
59–73 — indistinguishable from the AI-generated repos in the same corpus. A
full hand review of every security-category finding on the three controls
(94 findings — 100% reviewed, not sampled) found **all 94 false**, entirely
from `sec/no-hallucinated-imports`, and traced to three independent gaps in
the `manifest` tier (`packages/cli/src/engine/tiers/manifest.ts`), none of
which the rule's own `derivePackageName()` exemptions (builtins, relative
imports, `@/`-style aliases) covered:

1. **Bare specifiers resolved via `tsconfig.json`'s `baseUrl`, read as npm
   package names.** shadcn-ui/taxonomy (`tsconfig.json`: `"baseUrl": "."`)
   imports `import { X } from "types"`, resolving to `./types/index.d.ts`;
   vercel/commerce (same `baseUrl: "."`, no `paths` at all) imports
   `import { Carousel } from "components/carousel"` and
   `import { revalidate } from "lib/shopify"` — all real, on-disk local
   modules, all read as undeclared packages named `"types"`, `"components"`,
   `"lib"`. This was the dominant volume: 11/11 of taxonomy's findings, 82/83
   of commerce's.
2. **Scheme-prefixed specifiers (Deno/edge-function URL imports), read as
   npm package names.** Supabase Edge Functions — the default backend for
   Lovable-generated apps, and present in two of the four AI-generated
   corpus repos too — import
   `import { serve } from "https://deno.land/std@0.168.0/http/server.ts"`.
   `derivePackageName` only excluded specifiers starting with `.` or `/`; a
   `https://` URL starts with neither, so it extracted the literal string
   `"https:"` as a package name and flagged it as undeclared. 8/11 of the
   false positives found on the corpus's AI-generated repos (sports-on-the-
   go, mindtrack-personalwellness) were this same shape, so this gap wasn't
   control-repo-specific.
3. **Comment-blind specifier extraction.** Already a known, documented limit
   (the rule's own README carried a TODO added after it caused two false
   positives in pickcheck's own repo — commit `b3595cb`) but not yet fixed.
   Corpus review found it firing on real-world code, not just self-audits:
   vercel/commerce's `postcss.config.mjs` has
   `/** @type {import('postcss-load-config').Config} */` — a JSDoc type
   annotation, dead text — extracted as a live import of a real but
   undeclared package; sports-on-the-go has a code comment
   `// ...switching away from "Other"`, where the regex read `from "Other"`
   out of English prose and flagged `"Other"` as a hallucinated package.

The interaction that made all three matter together, not just the highest-
volume one: `PER_RULE_PENALTY_CAP` (DECISIONS/0006) means a *single*
error-severity finding from this weight-4 rule already saturates its own
contribution to the `security` category (`25 × 4 = 100`, capped to 50).
Fixing only gap 1 (by far the largest by count) would still have left
commerce's lone gap-3 finding capping `security` at 50 and the composite at
the `SCORING_GATES` ceiling of 59 — identical to before the fix. All three
needed fixing together for commerce to actually move.

## Decision

Fix all three in `manifest.ts`'s existing exemption logic — this is the
manifest tier correctly finishing its own stated job ("is this specifier a
real npm package"), the same category of engine capability its `@/`-alias
and builtin-module exemptions already are, not a rule-specific special case
per CLAUDE.md's "rules are data" (the extraction *pattern* stays rule data;
what counts as "not actually a package" is generic tier behavior, as it
already was for builtins/relative-imports/`@/`).

1. **Scheme-prefixed specifiers** (`derivePackageName`): a specifier
   matching `/^[a-z][a-z0-9+.-]*:/i` (a URI scheme) is never a package
   import — covers `https://`, `http://`, `npm:`, `jsr:`, and (redundantly
   but harmlessly) `node:`.
2. **baseUrl/repo-root local resolution** (`isHallucinated`, new
   `resolvesLocally`/`resolveBaseDir` helpers): a bare specifier not found
   in `declared` is checked against the nearest ancestor
   `tsconfig.json`/`jsconfig.json`'s `compilerOptions.baseUrl` (walking up
   to the scanned root, one config's value used — not unioned — since
   `baseUrl` isn't cumulative the way manifest dependencies are), falling
   back to the scanned repo root itself if no config declares one. Tried
   as: the exact path, each of `.ts/.tsx/.d.ts/.js/.jsx/.mjs/.cjs`
   appended, the same set under an `/index` suffix, or a bare existing
   directory. The repo-root fallback (not just "no baseUrl configured, so
   nothing resolves") also covers bundler root-relative resolution
   (Vite's default root, webpack's `resolve.modules`) with no tsconfig in
   the picture at all.
3. **Comment stripping** (new `stripComments`, exported for direct
   testing): every `//` line comment and `/* ... */` block comment is
   replaced with blank space (newlines preserved, so `Finding.line` stays
   accurate) before the specifier-extraction regex runs. A character-scan
   that tracks string-literal state (so a quote inside a comment can't open
   a fake string) and comment state (so `//` inside an open string —
   `"https://…"` — is never treated as a comment start). Not a real parser
   (nested template-literal expressions and regex literals containing `//`
   aren't handled), but it closes both real-world shapes found above and
   both prior self-audit false positives. The rule's README already
   recommended an `astgrep`-tier v1.1 rewrite as the structurally correct
   long-term fix for this specific gap; that recommendation stands for any
   edge case this character-scan doesn't cover, but corpus evidence made
   it worth fixing now rather than waiting.

Fixture coverage added per CLAUDE.md's mandatory false-positive suite,
built from the exact real-world shapes found, not paraphrases:
`fixtures/good/{tsconfig.json, types/index.d.ts, config/site.ts,
src/uses-baseurl-imports.ts}` (gap 1), `fixtures/good/supabase/functions/
hello/index.ts` (gap 2), `fixtures/good/postcss.config.mjs` and
`fixtures/good/src/comment-quotes.ts` (gap 3) — plus two `fixtures/bad/`
regression guards: a `tsconfig.json` alongside the existing
`fetch-retry-pro` case (proves a `baseUrl` doesn't create a blanket
bypass — a specifier that resolves neither to a dependency nor a real
local file must still be flagged) and `src/comment-adjacent.ts` (proves
comment-stripping doesn't swallow a real import on the line right after a
comment mentioning an unrelated fake package name).

## Consequences

- Re-running the corpus (`pnpm corpus`) after this fix plus DECISIONS/0016:
  `taxonomy` 59 → 81.59, `commerce` 59 → 78.78 — both clear the 75
  control-repo bar. Full before/after table in the corpus re-run's own
  commit.
- Verified this doesn't cost recall on genuine violations: fin-bloom-dash
  (AI-generated) has two `sec/no-hallucinated-imports` findings for
  `lovable-agent-playwright-config` — a real, undeclared package (absent
  from all 66 of its declared dependencies) — unaffected by any of the
  three fixes above (it's a live top-level import, not a comment; a bare
  npm-style specifier, not scheme-prefixed or baseUrl-resolvable). Both AI-
  generated repos with a real `sec/no-env-in-git` finding (sports-on-the-go,
  mindtrack-personalwellness — genuinely tracked `.env` files) stay gated
  at composite 59 after removing their false hallucinated-imports findings,
  confirming the gate still catches real problems once the noise is gone.
- `resolvesLocally`'s directory-existence fallback is deliberately
  permissive (matching the manifest cross-reference's own plausibility
  bar, not a real module resolver) — a genuinely hallucinated package name
  that happens to collide with a real local directory name would be
  wrongly exempted. Accepted tradeoff, same shape as the pre-existing
  `@/`-alias exemption's own imprecision; revisit if it proves to hide a
  real finding in a future corpus run.
- `sec/no-secrets-in-code` and `sec/post-has-validation` are unaffected —
  neither fired on any of the 8 corpus repos, so there was nothing to
  review or fix there. That's a coverage gap in this dataset (EXECUTION.md
  item 4 — adversarial fixtures), not evidence either rule is correct or
  wrong; still unvalidated against real code.
