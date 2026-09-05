# ADR 0028 — Backend coverage: three rules for the layer the ruleset never looked at, and a `when` precondition for the regex tier

**Status:** accepted · **Date:** 2026-09-05

## Context

[ADR 0027](0027-recall-drift-in-shipped-rules.md) was a recall pass over
the *shipped* ruleset: four rules that detected less than they claimed,
all of them because they were calibrated against Next.js-shaped controls
and never checked against the Vite + React + Supabase arm of the corpus.
Fixing them was mechanical — widen a glob, widen a regex — and it closed
the gap between what those five rules said and what they did.

It left the larger gap untouched: the things **no rule was looking for at
all**. Re-reading the AI-generated arm by hand against the ADR 0014
protocol ("what would a senior reviewer flag?"), the same three defects
kept coming back, and every one of them lives on the backend seam — the
place a browser-first ruleset has no vocabulary for.

1. **Two Edge Functions deployed with authentication switched off.**
   `sports-on-the-go/supabase/config.toml` declares
   `verify_jwt = false` for `moderate-content` and `chat-sporty`. Both
   read `LOVABLE_API_KEY` from the environment and forward the caller's
   input to `ai.gateway.lovable.dev` with that key attached. No account
   check, no quota, no rate limit — relaying the gateway's `429` to the
   caller is error reporting, not throttling. Anyone with the URL has a
   free LLM endpoint billed to the project owner, and `chat-sporty`
   accepts the whole `messages` array, so the caller supplies the system
   prompt too. No shipped rule reads `config.toml` at all.

2. **Nine Supabase call sites that discard their result.** supabase-js
   never throws: its query builder resolves with `{ data, error }`, so a
   write blocked by row-level security or rejected by a constraint is
   indistinguishable from success unless somebody reads `error`. This is
   a defect class `qual/no-empty-catch` and
   `qual/fetch-has-error-handling` cannot model — the code often *has* a
   `try`/`catch`, it just can't fire. `AuthContext.tsx:110` discards a
   `profiles` update and then renders `Welcome back!`; three more discard
   the `community_members` insert that is supposed to make you a member of
   the thing you just created, under a `Community created!` toast.

3. **A checkout flow with no backend behind it.**
   `shelfly-creator-hub/src/pages/CheckoutPage.tsx:44-45` takes card
   number, expiry and CVC, awaits `new Promise(r => setTimeout(r, 1500))`,
   renders "Payment Successful!" and clears the cart. Nothing leaves the
   browser. The assistant stubbed the one part it had no infrastructure
   for, and the stub looks finished — spinner, disabled button, success
   screen — which is exactly why it ships.

## Options considered

### For `qual/simulated-backend`: how wide to trigger

The rule's subject is a *handler*, and the regex tier reads one line at a
time, so the trigger and the thing that makes it a defect are never on the
same line. Three shapes were measured across all eight repos:

| Trigger | Findings | TP | Not |
|---|---|---|---|
| any `setTimeout(`, no gates | 22 | 4 | 18 — toast timers (`use-toast.ts` in four repos), a debounce, a scroll handler, a resend cooldown, a terminal animation |
| any `setTimeout(`, gated on a submit-shaped handler in the file **and** no network call in the file | 5 | 4 | 1 — a second line in a file already flagged |
| `await new Promise(… => setTimeout(…))`, no gates | 4 | 2 | 2 — both `geocode/index.ts` retry backoff |
| `await new Promise(… => setTimeout(…))`, both gates **(shipped)** | 2 | 2 | 0 |

The middle row is the interesting one, because it is genuinely close: it
catches `ProductDetail.tsx:30` and `PricingPage.tsx:23`, two more
`handleCheckoutSubmit` handlers that set a success flag and reset the
dialog on a timer. Those are the same bug. It was still rejected — see
Decision.

### For the preconditions: a new tier, a `scope` field, or `when`

Encoding "the file must contain a submit handler" needed a capability the
regex tier didn't have. Three options:

1. **A new tier.** CLAUDE.md's stated instruction when a rule needs new
   engine capability. But a tier is the right unit when the *question*
   changes — that is what earned `coverage` its own tier in ADR 0027 (a
   set relation between two extracted name sets, sharing no machinery with
   anything else). Here the question is unchanged: does this text pattern
   occur on this line? Only the window the *context* is read from differs.
2. **`pattern.scope: line | file`,** generalising the matching window.
   More powerful, and it would also let a rule correlate a TOML section
   header with the key underneath it. Rejected as unneeded: nothing in
   this batch requires a match to span lines, and `minCount` already has
   whole-file semantics, so the two would need reconciling for no
   present-day gain.
3. **`pattern.when`,** the exact mirror of the existing `pattern.unless`:
   a whole-file content precondition. Same shape, same evaluation point,
   opposite sign.

## Decision

### 1. `pattern.when` on the regex tier (option 3)

```yaml
pattern:
  regex: <the trigger, per line>
  when:   { regex: <must appear somewhere in the file> }   # new
  unless: { regex: <must not appear anywhere in the file> }
```

Ten lines in `tiers/regex.ts`, evaluated immediately before `unless` on
the same raw content. This is the fourth member of a family the repo
already has — the exists tier's glob `when`
([ADR 0005](0005-conditional-exists-precondition.md)), the regex tier's
`unless` ([ADR 0008](0008-regex-unless-precondition.md)), `minCount`
([ADR 0011](0011-regex-mincount-threshold.md)) — all optional pattern-payload
fields that any rule can opt into and that unset rules never notice.

**It deliberately does not affect scoring applicability.** The exists
tier's `when` does, because there the precondition is a file glob and
`scorer.ts`'s `isApplicable` can evaluate it without reading anything. A
content precondition can't be evaluated there, and `unless` has never
been either: a regex rule counts as "checked" if its glob matched files,
whatever the content turns out to say. Consistent with every existing
rule, and no behaviour change to any of them.

### 2. `sec/edge-function-no-auth` — error, regex, weight 4

`verify_jwt = false` in any `**/supabase/config.toml`, one finding per
offending function block. This is not a heuristic: it is the exact switch
that tells the Supabase gateway to stop requiring a bearer token. A
function with no block, or a block without the key, is untouched — the
platform default is `true`.

**Severity `error`, in line with the other unambiguous security rules**
(`no-secrets-in-code`, `no-hallucinated-imports`, both weight 4). The
consequence is not "this could be a problem": the endpoint is public, it
runs with the project's server-side environment, and on a Supabase
project that environment always includes `SUPABASE_SERVICE_ROLE_KEY`,
which bypasses row-level security by design.

**Third-party webhooks are a real exception and are deliberately not
excluded.** A Stripe or Twilio callback genuinely cannot present a
Supabase JWT, so `verify_jwt = false` is correct for it and the
authentication moves into the body as a signature check. The corpus
contains zero instances, and ADR 0027 set the precedent for this exact
situation with `ux/destructive-no-confirm`'s `HabitList` false positive:
with no measurement, record the class, don't code against it. It is
documented in the rule's README with the `.pickcheckignore` escape hatch.

### 3. `qual/supabase-result-unchecked` — warn, regex, weight 2

The discriminator is `await` in **statement position**: a line beginning
`await supabase…`, so nothing binds, returns, or otherwise consumes the
`{ data, error }`. Every way of keeping the result puts a different token
first and cannot match. Two forms are accepted after the client —
end-of-line (a multi-line chain, how prettier formats
`.from().update().eq()`) and `.from(` / `.rpc(` /
`.functions.invoke(` inline.

**`auth` and `storage` are excluded on measurement.** Widening to the
whole client adds exactly six findings, and all six are noise:

- four `await supabase.auth.signOut()` calls (`MobileSidebar.tsx:14`,
  `Header.tsx:17`, `Profile.tsx:283`, `GoogleConsent.tsx:77`). A failed
  sign-out is corrected by the next page load, and `Profile.tsx:283`
  signs out an account that was just deleted.
- two `storage.remove()` cleanups (`Profile.tsx:185`,
  `delete-account/index.ts:43`), both deleting an avatar that is being
  orphaned anyway.

None would change what a developer does. The nine that remain are all
table writes or RPCs.

**`warn`, not `error`,** despite the README arguing this is worse than an
empty `catch`: the rule can see that the result was discarded, but not
whether the caller cares. `qual/no-empty-catch` is `error` because an
empty catch is unambiguous. This isn't.

### 4. `qual/simulated-backend` — warn, regex, weight 2, narrow trigger

The awaited-delay trigger (third row of the table above), gated on a
submit-shaped handler (`when`) and the absence of any network call
(`unless`).

**The middle row was rejected, and this is the cost.**
`ProductDetail.tsx:30` and `PricingPage.tsx:23` are real defects this rule
does not catch. The reason is what the two triggers *are*, not the
one-finding difference in the measurement: an awaited `setTimeout` does
nothing whatsoever except make the next line happen later, so in a file
that never contacts a server it has no purpose but to imitate one. A bare
`setTimeout` schedules work, which is what debounce, throttle,
auto-dismissing toasts and delayed redirects all legitimately are — and
the corpus contains 18 of those against 4 real ones. The two gates rescue
that ratio here, but they are gates on the *file*, not on the timer, and
they would be carrying a trigger whose own base rate is 4-in-22. The
narrow trigger's is 2-in-4, and the same gates take it to the end. Recall cost accepted and recorded;
`fixtures/good/src/useDebouncedSave.ts` and
`fixtures/good/src/OptimisticLike.tsx` are the real shapes, so the trigger
cannot be widened silently.

**Both gates are measured together, and neither is individually
necessary on this corpus.** Ungated, the awaited-delay trigger runs at 50%
— it picks up both of `sports-on-the-go`'s `geocode` sleeps, which are
retry backoff between live `fetch` calls to a geocoding API. Adding either
gate alone excludes them: `geocode` has no submit handler *and* calls
`fetch`. So the honest statement is that the pair takes the rule from 50%
to 100% and the corpus cannot rank them.

They are both kept because they exclude different things and the corpus is
too small to have shown either failing alone. `unless` is the one with a
demonstrated instance behind it (backoff beside a real request). `when`
has none, and is in because without it the rule flags an awaited sleep in
an animation sequencer or a retry helper — files that contain no handler
at all — and its own title becomes false. That is a different act from
guessing at an exclusion: it narrows the rule to its documented claim
rather than removing a measured finding.

## Results

Corpus re-run, all 8 repos. **All four controls: zero change** — same
composite, same findings, on every one. Thirteen new findings, all on the
AI-generated arm, each hand-classified against its real source per the ADR
0014 protocol (100% reviewed, not sampled):

| Rule | New | TP | Arguable | FP | Precision (excl. arguable) |
|---|---|---|---|---|---|
| `sec/edge-function-no-auth` | 2 | 2 | 0 | 0 | 100% |
| `qual/supabase-result-unchecked` | 9 | 8 | 1 | 0 | 100% |
| `qual/simulated-backend` | 2 | 2 | 0 | 0 | 100% |
| **Total** | **13** | **12** | **1** | **0** | **100%** |

Counting the single arguable as a miss, the batch runs at 92.3%.

The classifications:

**`sec/edge-function-no-auth` — 2 TP.** `config.toml:4`
(`moderate-content`) and `:7` (`chat-sporty`), both described in Context.

**`qual/supabase-result-unchecked` — 8 TP, 1 arguable.**

- `AuthContext.tsx:110` — `profiles.update({last_login_at})` discarded,
  `toast.success("Welcome back!")` on the next line.
- `Community.tsx:573` — inserts the creator into `community_members` as
  `admin`; discarded, under `Community created!`. If the insert fails you
  own a community you are not a member of.
- `Discover.tsx:999`, `MyGames.tsx:846` — auto-join inserts into
  `community_members`, discarded, both under a "Successfully joined!"
  toast.
- `MyGames.tsx:642` — inserts a game-update announcement post inside a
  `try`/`catch` whose `catch` logs `Error posting community
  announcement`. That catch cannot fire, and the line after it logs
  `Community announcement posted` unconditionally. The clearest single
  illustration of why this needed its own rule.
- `TermsVersionChecker.tsx:68` — inserts the terms-update notification,
  discarded, and the surrounding logic has already decided not to
  re-check.
- `chat/index.ts:74` and `:84` — the rate-limit counter's update and
  insert. If either fails the limiter reads a stale count forever and
  stops limiting, which makes this the same spend exposure as rule 1 by a
  different route.
- **Arguable:** `chat/index.ts:81`,
  `supabase.rpc("clean_old_rate_limits")`. Best-effort periodic cleanup;
  a failure leaves stale rows and nothing else. Real, but not worth a
  developer's attention.

**`qual/simulated-backend` — 2 TP.** `CheckoutPage.tsx:45` (card details
collected, 1.5s sleep, "Payment Successful!", cart cleared) and
`ContactPage.tsx:28` (1s sleep, "Your message has been sent!", fields
cleared).

### Score movement

| Repo | Composite | Category |
|---|---|---|
| taxonomy (control) | 79.54 → 79.54 | — |
| saas-starter (control) | 78.70 → 78.70 | — |
| commerce (control) | 76.42 → 76.42 | — |
| precedent (control) | 86.11 → 86.11 | — |
| fin-bloom-dash | 59 → 59 | — |
| sports-on-the-go | 54.40 → **40.51** | security 33.33 → 25, quality 100 → 50 |
| shelfly-creator-hub | 59 → **53.88** | quality 100 → 55.56 |
| mindtrack-personalwellness | 59 → **53.87** | quality 100 → 50 |

Self-audit unchanged at 100/100 across 23 rules.

## Consequences

- **Three repos that scored 59 for three different reasons now score
  differently.** `shelfly` and `mindtrack` were both pinned at exactly 59
  by the security gate (ADR 0006) and were therefore indistinguishable;
  both now fall below it on their own merits and the number means
  something again. That is the gate behaving as a ceiling, as designed —
  but it is worth noting that a gate hides *all* variation above its cap,
  so any future ruleset work measured only by composite will look like a
  no-op on every repo the gate is binding for. Read the category scores.
- **`quality` was at 100 for three of the four AI-generated repos before
  this batch, and is now the category that discriminates them.** The
  previous quality rules (`no-empty-catch`, `fetch-has-error-handling`)
  are shaped around exceptions and `fetch`; an app whose entire data layer
  is a non-throwing client and whose network calls are all
  `supabase.from(…)` presented a clean quality surface it hadn't earned.
- **`sports-on-the-go` at 40.51 is the lowest score any corpus repo has
  had**, and 67 findings is past the point where a flat list is usable.
  Nothing here fixes that; it is an argument for grouping in the renderer,
  not for fewer rules.
- **The config-file surface is barely touched.** `supabase/config.toml` is
  now read by exactly one rule, for exactly one key. The same file
  declares auth settings, and the same class of "a flag that turns a
  protection off" lives in `next.config.js`
  (`typescript.ignoreBuildErrors`, `eslint.ignoreDuringBuilds`),
  `vercel.json`, and GitHub Actions `permissions`. If that becomes a
  theme, the `scope: file` option rejected above is the capability it will
  need, because those flags are nested rather than line-anchored.
- **`when` has one consumer and should stay general.** Like the `coverage`
  tier before it, the temptation will be to grow it a rule-shaped feature
  (a proximity window, a capture-group binding). Both belong in a new
  record if they are ever needed.
