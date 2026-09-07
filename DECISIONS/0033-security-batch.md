# ADR 0033 — The security batch: three new rules, and the positional-argument gap in `sec/no-secrets-in-code`

**Status:** accepted · **Date:** 2026-09-07

## Context

[ADR 0032](0032-rule-batch-candidates-and-two-more-confounds.md) measured
eighteen candidate rules against the 13-repo corpus and cleared six to be
written. This record implements the four that are `security`, which is one
PR rather than four because they are one finding: the corpus's worst repo
is worst in a way the ruleset could not see.

The gap that motivates the batch is in a *shipped* rule.
`sec/no-secrets-in-code` is the ruleset's highest-severity rule — `error`,
weight 4, and one of the triggers for `SCORING_GATES`' composite cap — and
it produces **zero findings** on `newattendanceapp`, which carries two
different projects' Supabase **service-role** keys in committed source,
valid until 2034 and 2035, in a staff attendance and payroll application.

The cause is a recall gap of the [ADR 0027](0027-recall-drift-in-shipped-rules.md)
class. Four of the rule's shapes are *self-identifying* — `sk-`, `AKIA`,
`ghp_` — and need no variable name. The fifth is *name*-anchored:
`(api_key|secret|token) = "..."`. A credential passed **positionally**
never touches a name. `createClient(url, "eyJ...")` reads its key as
argument two, so there was nothing for the name branch to anchor on and
the rule stayed silent.

## Decision

### 1. `sec/no-secrets-in-code` gains a shape-anchored JWT branch

A JWT is three dot-separated base64url runs each beginning `eyJ`, because
a JSON object starts `{"`. That is self-identifying in exactly the way the
vendor prefixes are, and it is the most common credential shape in a
JavaScript application that has no vendor prefix.

**Widening the name branch was measured first, and rejected.** Adding
backticks to the quote class, and adding
`password`/`passwd`/`credential`/`private_key`/`access_key`/`anon_key` to
the name list, gains **zero** findings across all 13 corpus repos. Both
variants were run before either was written into a `rule.yaml`. A wider
name list is the kind of change that looks like progress and buys nothing;
it is recorded here so nobody re-derives it.

**The JWT branch excludes Supabase-issued tokens** — payload prefix
`{"iss":"supabase"` → `eyJpc3MiOiJzdXBhYmFz`, exact because a payload
segment always starts at base64 offset 0. Both Supabase roles are handled
elsewhere and neither belongs in a generic secrets rule:

- `service_role` is decision 2's rule, which names the role and explains
  that it bypasses row-level security. Matching it here **as well** would
  bill one defect to two `error`-severity rules. That is not free: the
  scorer's category curve is `100 × K / (K + Σcapped)` with `K` and
  `PER_RULE_PENALTY_CAP` both 50 ([ADR 0009](0009-scoring-diminishing-returns.md)),
  so one capped rule scores the category at 50 and two score it at 33.3.
  Double-billing would cost a real ~17 category points for a single
  underlying defect.
- `anon` is **not a secret**. Supabase ships it to every browser by
  design; row-level security, not the key's secrecy, is what protects the
  data behind it. This rule's own message says *rotate it*, which would be
  wrong advice, at `error` severity, behind a composite gate.

**The consequence is that this fix adds zero corpus findings, and that is
the intended outcome.** Every JWT in the corpus is a Supabase key, and
both roles are correctly claimed elsewhere. What the fix buys is that the
*next* pasted JWT — Auth0, Clerk, Firebase, a session token copied out of
devtools — is caught by shape rather than by whether someone happened to
name the variable `token`. The gap is closed structurally and the fixture
proves it; the corpus simply contains no non-Supabase instance.

### 2. `sec/hardcoded-service-role-key` — error, weight 5

Two branches, both about the same credential.

**The key literal, identified by role, without decoding it.** The engine
has no base64 decoder and does not need one. Base64 maps 3 bytes to 4
characters, so a fixed substring of a JWT payload has a *deterministic*
encoding once its byte offset mod 3 is known — and there are only three
possible offsets. Three literals therefore cover every case:

```
Iiwicm9sZSI6InNlcnZpY2Vfcm9sZS
IsInJvbGUiOiJzZXJ2aWNlX3JvbGUi
iLCJyb2xlIjoic2VydmljZV9yb2xlI
```

Each is the *invariant middle* of base64url(`","role":"service_role"`) at
one alignment. The leading and trailing characters are trimmed because
they encode bytes shared with the neighbours — and that trimming is not
theoretical fussiness. ADR 0032 presented this technique as a single
literal, and the first implementation of it carried a trailing character
that depended on the byte *after* the target. It matched every real corpus
token and silently failed on a synthesised key with a 19-character project
ref. The three-alignment form with both ends trimmed is what survives; the
parameterised test over ref lengths 16–24 is what caught the earlier one.

This is what lets the rule tell the two Supabase roles apart, which is the
whole point: `"role":"anon"` encodes to a different run of characters and
never matches, at any alignment.

**The key routed through a client-exposed env name.** `NEXT_PUBLIC_*`,
`VITE_*`, `REACT_APP_*` and `EXPO_PUBLIC_*` are not naming conventions —
they are instructions to the bundler to inline the value into the browser
bundle. There is no legitimate reason for a service-role key to sit behind
one, so the name alone is the finding and the rule does not attempt to
prove the variable is currently set.

The rule **deliberately does not set `excludePackageScriptTargets`**
([ADR 0017](0017-disc-no-console-log-script-target-exemption.md)). All
twelve corpus findings are in `scripts/`, which is exactly where this key
gets pasted, and a committed credential is committed whether or not
`npm run` can reach the file it sits in. That flag is for rules about
application *runtime* code; this rule is about a secret being in the
repository at all.

Weight 5 rather than 4, matching `sec/no-env-in-git` — the other rule
whose subject is a credential already in the git history. At `error`
severity the choice is presentational rather than arithmetic: 25 severity
points × any weight ≥ 2 already exceeds `PER_RULE_PENALTY_CAP`, so the
first finding costs the same either way.

### 3. `sec/admin-route-no-auth` — error, weight 4

An exported HTTP method handler, in a route file living under both an
`api` and an `admin` path segment, in a file that contains no
authorization marker anywhere.

**The path scoping is the rule.** ADR 0032 measured the unscoped form —
"an API route with no auth reference" — and rejected it: framework Δ −0.71
against a generator Δ of +0.10, firing on `saas-starter`'s Stripe webhook
(which verifies a signature) and `commerce`'s revalidate route (which
checks a secret). Unscoped it is a "does this repo have Next.js API
routes" detector.

`unless` is deliberately generous — a session lookup, a user fetch, a role
test, a `401`, or a bare mention in a comment all silence the file. This
rule's value is precision; a missed finding is cheap and a false
accusation on an admin route is not.

Two entries are load-bearing by their **absence**, and both are pinned by
tests:

- **`service_role` is not an auth marker.** A handler reaching for the
  service-role key is bypassing row-level security, which is the opposite
  of authorizing its caller. Listing it would have exempted
  `newattendanceapp/app/api/admin/users/by-role/route.ts`, which builds a
  service-role client and enumerates the entire user directory for any
  role the caller names.
- **`Authorization` is not one either.** `\bauth\b` cannot match
  `Authorization` — the trailing `o` defeats the word boundary — so a
  route that forwards an auth header without ever checking it is still
  flagged.

### 4. `sec/weak-default-credential` — error, weight 4

A password-shaped identifier assigned a *closed* literal from a
known-weak list. The closing quote is the discriminator, and anchoring on
the identifier to the left of the `:`/`=` is what keeps the many places
the word "password" appears as a *value* out of scope — `type="password"`,
`placeholder="password"`, `autocomplete="current-password"` all have a
different identifier on the left.

Each base word takes an optional short numeric suffix with an optional
separator. That generality is not cosmetic: the first draft enumerated
suffixed variants by hand, missed `password123`, and found **zero** of the
corpus's two real instances. Both instances are `password: "password123"`
in `newattendanceapp/app/api/admin/test-users/route.ts` — a live route
handler, not a seed script.

The rule sets `excludePackageScriptTargets`. `nextjs/saas-starter` has
`const password = 'admin123'` in `lib/db/seed.ts`, reachable only as
`npm run db:seed`, and it is the corpus's only control hit. **Measured
both ways:** with the flag, 2 findings and no control hit; without it, 3
findings including the control. That is ADR 0017's machinery doing the
work it was built for, not a carve-out invented for this rule.

## Results

### Corpus precision — all 24 new findings hand-classified

| Rule | Findings | TP | FP | Arguable | Precision (excl. arguable) |
|---|---|---|---|---|---|
| `sec/hardcoded-service-role-key` | 12 | 12 | 0 | 0 | **100%** |
| `sec/admin-route-no-auth` | 10 | 8 | 1 | 1 | **89%** |
| `sec/weak-default-credential` | 2 | 2 | 0 | 0 | **100%** |
| `sec/no-secrets-in-code` (JWT branch) | 0 | — | — | — | no corpus instance |
| **Total** | **24** | **22** | **1** | **1** | **96%** |

**`sec/hardcoded-service-role-key`, 12/12.** Every one of the nine key
literals was decoded and every one carries `"role":"service_role"` — seven
from project `vgtajtqxgczhjboatvol` (`exp` 2035) and two from
`qfyajdlxqxtxmljxacij` (`exp` 2034). The remaining three are
`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` reads. One honest qualification on
those three: the repo's `.env.example` declares the correctly-named
server-only `SUPABASE_SERVICE_ROLE_KEY`, and the public-prefixed name
appears only as a `||` fallback. They are true positives for the claim the
rule actually makes — *a service-role key is being read from a name the
bundler would inline* — and not evidence that this repo's key is currently
in its browser bundle.

**`sec/admin-route-no-auth`, 8 TP / 1 FP / 1 arguable.** This **corrects
ADR 0032**, which reported all ten as true positives on a reading that was
not thorough enough. Reading each handler in full:

- **True positives (8).** `theghost`: `users/delete` (unauthenticated
  `DELETE FROM ghost_users WHERE id = $1`), `users/ban`, `stats` (live
  counts of all users and messages), `users/[userId]/messages` (maps a
  user id to their `ghost_id` and display name — in an app whose premise
  is anonymous chat), `messages`. `newattendanceapp`: `user-credentials`
  (`GET ?email=` returning `.select("email, password, role, …")`),
  `users/by-role` (service-role client, full user directory),
  `test-users` (`select("*")` on a table holding passwords).
- **False positive (1).** `newattendanceapp/app/api/admin/bulk-upload/template/route.ts`
  returns a fixed sample import template with invented names in it. There
  is no data to protect. No exclusion is coded for it: "a handler with no
  dynamic data" is not determinable at this tier, and a `template`-shaped
  path exclusion would be fitting a rule to a single sample, which
  [ADR 0014](0014-ruleset-calibration.md) exists to warn against. It is
  documented as a known limit instead.
- **Arguable (1).** `newattendanceapp/app/api/admin/supabase-config/route.ts`
  discloses only *whether* env vars are set. A real information leak from
  an admin surface, and nearly harmless.

### Corpus diff

24 findings added across 2 repos, **0 on any control**. The other eleven
snapshots changed by one line each — `ruleCount` 25 → 28 — with composites
byte-identical.

| Repo | Cell | Composite | Findings | New |
|---|---|---|---|---|
| `theghost` | ai/next | 56.96 → **51.40** | 30 → 35 | 5 |
| `newattendanceapp` | ai/next | 39.10 → **29.10** | 1,168 → 1,187 | 19 |
| all 6 controls | — | unchanged | unchanged | 0 |

Both movements are category arithmetic, not the security gate: each repo
already carried an `error`-severity security finding and was already below
the gate's cap of 59. `newattendanceapp`'s security category is now 20.0
and `theghost`'s 33.33, which is three and two capped security rules
respectively under ADR 0009's curve.

### Self-audit

100/100, 0 findings, unchanged. Notably the new rules are the kind that
could plausibly fire on this repo — it has `packages/rules/**/fixtures/**`
full of deliberately terrible samples — and the `!**/fixtures/**`
exclusions every one of them carries are what keep it silent.

## Consequences

- **The ruleset is 28 rules**, up from 25, against a v1.0 target of 40+.
  ADR 0032's remaining cleared candidates — `qual/mock-data-served-as-real`,
  `docs/readme-has-no-setup`, `ux/alert-as-error-ui` — are unaffected by
  anything here and remain the next PR.
- **ADR 0032's precision claim for `sec/admin-route-no-auth` was too
  generous and is corrected above.** The pattern is worth naming: a
  measurement pass that reads findings to decide *whether* a rule is worth
  writing reads them differently from an implementation pass that has to
  defend each one. The second reading is the one that goes in a README.
- **`newattendanceapp` at 29.10 is the corpus's lowest score**, and the
  security category is now doing most of that work. That is the intended
  effect of the batch, but it also means the repo is now three capped
  security rules deep, where ADR 0009's curve is flattening. A fourth
  security rule would move it very little.
- **Two rules now depend on Supabase's JWT payload shape.** If Supabase
  reorders its claims or stops issuing HS256 JWTs, decision 2's literals
  stop matching and decision 1's exclusion stops excluding. Both fail
  *closed* — a missed finding, never a false one — and the parameterised
  alignment test is what would catch it.
- **The `error`-severity weight distinction is presentational.** 25 × any
  weight ≥ 2 exceeds `PER_RULE_PENALTY_CAP`, so weight 4 vs 5 changes
  nothing about a first finding's cost. Worth remembering before anyone
  spends time tuning weights on error-severity rules.
- **The corpus still has no control repo that uses Supabase**, so the
  library-presence confound ADR 0032 named applies to decision 2 exactly
  as it does to `sec/edge-function-no-auth`: its 0/6 on controls is an
  empty denominator, not evidence of precision. Its 12/12 hand-classified
  true positives are.
