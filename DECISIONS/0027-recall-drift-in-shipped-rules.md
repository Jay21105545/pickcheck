# ADR 0027 — Recall drift in shipped rules: the `coverage` tier, and four rules that didn't detect what they claimed

**Status:** accepted · **Date:** 2026-09-05

## Context

[ADR 0014](0014-ruleset-calibration.md) ran the Stress-Test & Backtest
Protocol as a **precision** study: it took the findings the ruleset
produced and asked, of each one, "would a senior reviewer flag this?" It
found 36% precision, fixed four false-positive classes, and parked
`ux/hardcoded-px-width` at 18%.

It could not, by construction, say anything about the findings the ruleset
*didn't* produce. This record is the mirror study — a **recall** pass over
the same protocol, run against the now-8-repo corpus (four controls, four
Lovable-generated apps; `corpus/repos.json`, pinned by SHA). Method was
the same in kind: read the repos by hand, decide what a senior reviewer
would flag, then check what the ruleset said about it.

Four shipped rules turned out to be detecting materially less than their
own READMEs and RULESET.md claimed. Three had drifted the same way ADR
0014 found `ux/hardcoded-px-width` had — the implementation stopped
matching the documented intent, and no fixture happened to exercise the
difference. One had never implemented its spec at all.

**The drift class, stated once.** Every one of these rules was written
against a Next.js-shaped mental model of a web app: routes live in
`app/api/`, deletes go out over `fetch`, config is read with
`process.env`. All four controls are Next.js apps, and they are the repos
the rules were calibrated against. The AI-generated arm of the corpus is
Vite + React + Supabase, where the backend is `supabase/functions/`, the
delete is `supabase.from(t).delete()`, and the same `process.env` is
`import.meta.env` or `Deno.env.get`. The rules were not wrong about the
world; they were calibrated on half of it, and the half they missed is
precisely the half this tool exists to audit.

### What the four rules were actually doing

| Rule | Claimed | Did |
|---|---|---|
| `ux/destructive-no-confirm` | "a destructive action with no confirmation" | matched only `axios.delete(` and `method: "DELETE"` — **0 of the 17** real delete call sites in the corpus |
| `disc/no-console-log` | "debug output left in production code" | also flagged Deno edge-function logging, the platform's *supported* observability mechanism — **36 of 84** findings in one repo |
| `sec/post-has-validation` | "a request body read with no validation" | globbed a Next.js-only path list; and its regex hardcoded `request` for the `.json()` form, so `await req.json()` and `request.body` were both invisible |
| `docs/api-doc-exists` | "an API surface with no docs" | same Next.js-only path list — 7 corpus endpoints, none seen |
| `docs/env-example-exists` | RULESET.md §6: trigger on `process.env.X` reads, require ≥60% key coverage | triggered on "a `.env` file exists", checked only that `.env.example` existed at all |

## Options considered

**For the three glob/regex rules** the choice was only how wide to go. The
temptation with `ux/destructive-no-confirm` was to match `.delete(`
generally, or to add `remove` to the Server Action verb list. Both were
rejected on measurement — see Decision.

**For `docs/env-example-exists`** the check needs a capability no tier
had: compare a set of identifiers extracted from source against a set
extracted from a documentation file, and judge the *ratio*. Three options:

1. **A new `mode` on the `manifest` tier.** Superficially the right home —
   that tier also cross-references source against a declaration file. But
   it would share none of the machinery: no JSON parsing, no
   ancestor-manifest walk, no per-specifier resolution, and an aggregate
   verdict instead of one finding per occurrence. A mode that opts out of
   every part of its tier is not a mode.
2. **Engine code special-cased to this rule.** Directly against CLAUDE.md
   ("the engine never contains rule-specific code").
3. **A new `coverage` tier.** CLAUDE.md's stated instruction for exactly
   this situation: "If a rule needs new engine capability, add a new
   detection *tier*, not a special case."

## Decision

### 1. A new `coverage` tier (option 3)

`packages/cli/src/engine/tiers/coverage.ts`. Payload: `regex` (identifiers
the code uses), `declaredIn` (a file glob + regex for identifiers declared),
`threshold`, plus `optionalRegex` and `ignore`. Everything domain-specific
— what an env-var read looks like, which keys a platform injects — stays
rule data. The tier only knows about set coverage.

Three deliberate design points:

- **One finding per rule run, not one per missing identifier.** Fifteen
  findings saying "add a key to `.env.example`" are fifteen copies of one
  instruction. The names go in the fix-prompt detail, actionable in one
  edit.
- **First-participating-capture-group semantics**, unlike the manifest
  tier's exactly-one-group contract. An alternation over `process.env.X` /
  `process.env["X"]` / `Deno.env.get("X")` is far more readable as one
  group per branch.
- **`optionalRegex` earns its place on measured evidence,** not
  speculation. See below.

`stripComments()` moved from `tiers/manifest.ts` to
`engine/strip-comments.ts`, now that two tiers need it. Without it the
coverage tier read pickcheck's *own* `packages/rules/schema.ts` doc
comments — which spell out `process.env.X` in prose — as a required key,
and self-audited as a finding. Same class of bug as
[ADR 0015](0015-manifest-tier-false-positive-fixes.md)'s commented-out
imports, caught this time before shipping.

### 2. `ux/destructive-no-confirm` — two new shapes, and one deliberately refused

Added: `.delete()` **with empty parens** (query-builder terminal delete),
`deleteDoc(`, and a Server Action named `*delete*`/`*destroy*` bound via
`action={…}` or `useActionState(…)`.

**The empty parens are the whole discriminator, and they hold.** Every
built-in `delete` takes an argument — `newSet.delete(id)`,
`params.delete("q")`, `timeouts.delete(id)`, `cookies().delete('session')`
— and a query-builder delete never does. Measured across all eight repos:
13 empty-paren matches in `.tsx`/`.jsx`, every one a Supabase delete; 10
argument-taking `.delete(x)` calls, every one a harmless local collection
edit, none matched. This is what makes the addition *not* the name-based
heuristic the rule's README has always rejected.

**`remove` was refused.** The obvious Server Action verb list is
`delete|remove|destroy`. Measured, that alternation fires three times in
the corpus and **all three are on control repos**:

- `commerce/components/cart/delete-item-button.tsx:15` —
  `useActionState(removeItem, null)`, a shopping-cart line-item removal.
  Routine, reversible, and wrong to put a dialog in front of. **False
  positive.**
- `saas-starter/…/security/page.tsx:126` — `action={deleteAction}`, already
  cleared by the `unless` clause (the form's "Confirm Password" label).
- `saas-starter/…/dashboard/page.tsx:157` — `action={removeAction}`,
  remove-team-member, genuinely unconfirmed. **Arguable true positive.**

Zero true positives, one clear false positive, and it only fires on the
control arm. `delete` and `destroy` are unambiguous; `remove` is not, and
no amount of regex distinguishes removing a cart item from removing a
colleague. Recall cost accepted and recorded: saas-starter's
remove-team-member form is not caught. `fixtures/good/src/CartRemove.tsx`
is the real commerce shape, so the verb can't be re-added silently.

### 3. `disc/no-console-log` — serverless directories excluded

`supabase/functions/**`, `netlify/functions/**`,
`netlify/edge-functions/**`. Same reasoning as
[ADR 0017](0017-disc-no-console-log-script-target-exemption.md)'s
package-script exemption, one layer out: this is not application runtime
code, and in a Deno edge function `console.log` is the only instrument
there is. Firebase's bare `functions/` is deliberately **not** excluded —
that name is an app's own `src/functions/` helpers as often as a Cloud
Functions root, and a test pins that.

### 4. `sec/post-has-validation` and `docs/api-doc-exists` — serverless globs

Both gain `supabase/functions/**`, `netlify/functions/**`,
`netlify/edge-functions/**`, with a leading `**/` so a nested app in a
monorepo resolves.

`sec/post-has-validation` also needed its **regex** widened, or the glob
fix would have been worthless: the original `req\.body|await\s+request\.json\(\)`
hardcoded `request` for the `.json()` form, and all four unvalidated
corpus bodies read `await req.json()`. It would have matched 0 of 4. Now
`\breq(?:uest)?\.body\b|\bawait\s+[\w.]*\breq(?:uest)?\.json\(\)`, which
also admits Hono/Elysia's `await c.req.json()` while staying anchored on a
`req`/`request` receiver so `await res.json()` — parsing a *response* —
can never match.

### 5. `docs/env-example-exists` — RULESET.md §6 as specified

Rewritten onto the `coverage` tier. Trigger is now "the code reads env
keys", the check is ≥60% documented, and the missing names are named. Rule
id kept (`docs/env-example-exists`) despite now under-describing the check,
because changing it breaks anyone's config for no functional gain.

**`optionalRegex` exists because of one measured false positive.**
`precedent/app/page.tsx:13` reads `process.env.GITHUB_OAUTH_TOKEN` inside
a spread guard — it raises the GitHub API rate limit when set, works fine
when unset, and is deliberately absent from that repo's `.env.example`.
Without the exemption, `precedent` scored 0% coverage and took a finding:
a control-repo false positive, the exact alarm ADR 0014's protocol
defines. A value whose absence the code handles is not a required setting.
`fixtures/good/src/optional.ts` is the real shape.

The mirror case stays required: `const K = Deno.env.get("K"); if (!K) throw`
is the code declaring the key **mandatory**, and a test pins it.

## Results

Corpus re-run, all 8 repos (`corpus/snapshots/`). **All four controls:
zero change** — same composite, same findings. Ten new findings, all on the
AI-generated arm, each hand-classified against its real source per the ADR
0014 protocol (100% reviewed, not sampled):

| Rule | New | TP | FP | Arguable | Precision (excl. arguable) |
|---|---|---|---|---|---|
| `docs/api-doc-exists` | 2 | 2 | 0 | 0 | 100% |
| `sec/post-has-validation` | 4 | 3 | 0 | 1 | 100% |
| `ux/destructive-no-confirm` | 4 | 2 | 1 | 1 | 67% |
| **Total** | **10** | **7** | **1** | **2** | **87.5%** |

Plus **37 findings removed** — every one a `console.log` inside
`supabase/functions/**`, all true negatives by construction.

The classifications:

- **TP** — `sports` and `mindtrack` each have undocumented HTTP endpoints
  (`docs/api-doc-exists`); `chat-sporty:14`, `moderate-content:14` and
  `mindtrack chat:91` spread or interpolate an unvalidated body straight
  into an LLM call; `NotificationCenter.tsx:253` (`clearAll`) deletes every
  one of a user's notifications on one click; `ChatBot.tsx:92`
  (`clearChat`) deletes their whole conversation history on one click.
- **Arguable** — `geocode/index.ts:35` reads an unvalidated body but does
  hand-rolled `if (!address || !city) throw` presence checks; the rule's
  message says "no validation *library* detected", which is accurate.
  `NotificationCenter.tsx:233` deletes a single notification: real, but low
  enough stakes that a dialog is arguably worse UX.
- **FP** — `mindtrack/…/HabitList.tsx:64` deletes a `habit_completions`
  row to *un-tick a checkbox*. A reversible state change expressed as a row
  delete is indistinguishable from a real delete at this tier. Left
  unfixed and documented, following ADR 0014's precedent for
  `ux/onclick-non-interactive`: with n=1 the right move is to record the
  class, not guess at an exclusion.

Score movement: `taxonomy` 79.54, `saas-starter` 78.70, `commerce` 76.42,
`precedent` 86.11 — all unchanged. `mindtrack` 59 → 59 (discipline
62.5 → 100, offset by new docs/security/ui-ux findings).
`sports-on-the-go` 59 → 54.40, as the composite fell below the
error-severity security gate's cap of 59 and the gate stopped binding.

## Consequences

- **Removing 37 findings did not improve `sports-on-the-go`'s discipline
  score at all** — it stayed at exactly 50. `PER_RULE_PENALTY_CAP` (ADR
  0006) was already saturated at 84 findings and is still saturated at 47.
  The fix bought a report a user can act on (47 real findings instead of 84
  with 36 wrong ones) and bought nothing on the score. Worth knowing before
  anyone proposes noise reduction as a scoring lever: past the cap, it
  isn't one.
- **The regex tier reads comments.** Discovered by this work's own
  `fixtures/good/src/CollectionEdits.tsx`, whose explanatory comment
  containing the literal `.delete()` made the fixture fail. `stripComments`
  is now wired into the manifest and coverage tiers but *not* the regex
  tier, where changing it would affect every regex rule (and where
  `sec/no-secrets-in-code` arguably *should* scan comments — a secret in a
  comment is still committed). Left as a known limit; a candidate for its
  own record.
- **The Next.js-shaped-glob class is probably not exhausted.** Four rules
  had it; the fix was mechanical each time. Any new rule with a
  path-convention `files` list should be checked against the AI-generated
  arm of the corpus before shipping, not only the controls.
- `docs/env-example-exists`'s 60% threshold, applied honestly, does **not**
  flag `sports-on-the-go`'s genuinely-missing `LOVABLE_API_KEY`: two of its
  three required keys are documented, which is 67%. That is §6 working as
  specified. A percentage is a weak instrument for small key sets, and an
  absolute floor alongside the ratio would catch it — but that is a scoring
  change and needs its own record rather than being smuggled in here.
- The `coverage` tier is general and currently has one consumer. Plausible
  future ones: routes documented in `API.md`, feature flags declared in a
  registry. It should not acquire rule-specific fields.
