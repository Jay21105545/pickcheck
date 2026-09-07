# ADR 0032 — Eight candidates for the next rule batch, ten refused, and two confounds the corpus has been carrying all along

**Status:** accepted · **Date:** 2026-09-07

## Context

The ruleset ships 25 rules; EXECUTION.md's Definition of Done for v1.0 asks
for 40+. This record proposes the next batch and, more importantly, applies
[ADR 0029](0029-corpus-confound-and-expansion.md)'s order of operations to
it: **measure a candidate against the corpus before it has a
`rule.yaml`.** ADR 0029 established why — a `rule.yaml` is a shipping
decision, and the point of measuring first is that a candidate can be
killed without anyone ever having written fixtures for it. Three of the
four candidates ADR 0029 measured that way were killed. Ten of the eighteen
measured here are.

The candidates were probed directly against the pinned checkouts in
`corpus/.cache/`, stratified across the `category × stack` 2x2, and every
cited finding was read against its real source. That last step is not
ceremony: two of this record's three strongest-looking separators died on
it, after their counts looked clean.

## Decision

### 1. Eight candidates are proposed for the next batch, ranked by expected value

Ranked by severity × precision × strength of evidence, **not** by
separation. The cleanest separator in the batch sits third; the top-ranked
rule fires on one repo.

"Generator Δ" is fire-rate(AI) − fire-rate(control); "framework Δ" is
fire-rate(vite) − fire-rate(next), per ADR 0029.

| # | Rule | Tier | ctl/next | ctl/vite | ai/next | ai/vite | gen Δ | frame Δ | Findings |
|---|---|---|---|---|---|---|---|---|---|
| 01 | `sec/hardcoded-service-role-key` | regex | 0/4 | 0/2 | 1/3 | 0/4 | +0.14 | −0.14 | 9 · 1 repo |
| 02 | `sec/admin-route-no-auth` | regex + `unless` | 0/4 | 0/2 | 2/3 | 0/4 | +0.29 | −0.29 | 10 · 2 repos |
| 03 | `qual/mock-data-served-as-real` | regex | 0/4 | 0/2 | 3/3 | 2/4 | **+0.71** | −0.10 | 10 · 5 repos |
| 04 | `docs/readme-has-no-setup` | capability | 0/4 | 0/2 | 3/3 | 1/4 | +0.57 | −0.26 | 4 · 4 repos |
| 05 | `qual/catch-logs-only-in-component` | regex | 0/4 | 2/2 | 3/3 | 3/4 | +0.52 | **+0.40** | 231 · 6 repos |
| 06 | `ux/alert-as-error-ui` | regex | 0/4 | 1/2 | 2/3 | 1/4 | +0.26 | +0.05 | 52 · 4 repos |
| 07 | `sec/weak-default-credential` | regex | 0/4 | 0/2 | 1/3 | 0/4 | +0.14 | −0.14 | 2 · 1 repo |
| 08 | `qual/oversized-source-file` | *new capability* | 0/4 | 2/2 | 3/3 | 1/4 | +0.24 | +0.07 | 44 · 6 repos |

Ranks 05 and 08 are **held**, for reasons recorded in section 4. Ranks
01–04, 06 and 07 are cleared to be written.

**01 — `sec/hardcoded-service-role-key`, error, weight 4.** A Supabase JWT
literal whose payload decodes to `role: service_role`, plus the name form
`NEXT_PUBLIC_*SERVICE_ROLE*` / `VITE_*SERVICE_ROLE*`. It is regex-tier
detectable **without decoding anything**, which is the point:
`{"iss":"supabase","ref":"<20-char ref>` is exactly 45 bytes, so
`","role":"service_role"` lands on a 3-byte boundary and always encodes to
the literal substring `Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSI`. That run appears
in 9 files in `newattendanceapp` and nowhere else in 13 repos; the sibling
`role:anon` marker appears 5 times and is deliberately not matched, because
an anon key is designed to be public.

What earns it rank 1 is not its separation — it is **a verified recall gap
in the ruleset's highest-severity rule**. `sec/no-secrets-in-code` (error,
weight 4, the trigger for the security gate) produces **zero** findings on
`newattendanceapp`. Its regex requires `api_key|secret|token` immediately
before the `:=`; these keys are positional arguments to
`createClient(url, key)`. Two distinct projects' service-role credentials,
`exp` 2034 and 2035, are sitting in committed source in `scripts/` and the
ruleset says nothing.

**02 — `sec/admin-route-no-auth`, error, weight 4.** An exported
`GET|POST|PUT|PATCH|DELETE` handler in a route file whose *path* contains
`admin`, in a file mentioning no auth primitive at all (`unless`:
`auth|session|getUser|currentUser|jwt|verifyToken|requireAdmin|isAdmin|clerk|next-auth|service_role`).
The path scoping is the whole rule — the unscoped form is refused in
section 2. All 10 corpus findings are true positives on hand-read:
`theghost` ships an unauthenticated `DELETE FROM ghost_users WHERE id =
${userId}` and an unauthenticated ban endpoint;
`newattendanceapp/app/api/admin/user-credentials/route.ts` is an
unauthenticated `GET ?email=` doing `.select("email, password, role, …")`
and returning it.

Marginal recall stated honestly: `sec/post-has-validation` already flags
theghost's `ban` and `delete` routes for a *different* defect. It cannot
see the other eight, which are `GET` handlers with no body to validate, and
no shipped rule produces any finding at all on `user-credentials/route.ts`.

**03 — `qual/mock-data-served-as-real`, warn, weight 2.** `const
(mock|fake|dummy|sample|placeholder|demo)<Capital> … = [` in non-test
source, with the `files` exclusions `qual/simulated-backend` already
carries (`**/mocks/**`, `__mocks__`, `*.stories.*`, the test globs) plus
`seed`. The sharper server-scoped variant (`app/api/**`, `pages/api/**`,
`supabase/functions/**`) is the stronger claim: an endpoint returning
fabricated records to a real client. `theghost/app/api/admin/messages/
route.ts:7` is the canonical case, with a comment admitting it.

This is rule 13's missing half. `qual/simulated-backend` catches the
awaited-`setTimeout` shape and explicitly excludes `**/mocks/**`; it has no
way to see a route handler that just returns a literal. Same defect class,
disjoint detection. Measured with the verb list *widened* to include
`test*` and `example*`, all six controls stay at zero — the cleanest
separator in the batch.

**04 — `docs/readme-has-no-setup`, warn, weight 2.** The `capability`
tier, `reportAt: README.md`, providers = an install command
(`npm|pnpm|yarn|bun i/install/run`, `npx`) or a heading containing
`install|setup|getting started|quick start|running locally`. No
`revokedBy`.

Two things must go in its README. First, the FP shape: a product README
that delegates to hosted docs. `rowy` is exactly that and passes only
because it also keeps a "Manual Install" heading — a narrower heading
pattern (`^## (Install|Setup)`) flagged it, and the corrected pattern above
is what the numbers in the table were measured with. Second, discount its
recall before weighting it: **three of its four findings are on repos that
already fire `disc/builder-metadata-left-behind` on the same file** — the
v0 sync line *is* the whole README. Marginal new signal is one repo
(`fin-bloom-dash`, whose README is 90 bytes). It still earns a slot: the
defect is framework-independent, the `docs` category has only three rules,
and it gives the `capability` tier the second caller ADR 0030 asked for.

**06 — `ux/alert-as-error-ui`, warn, weight 1.** `alert(` or
`window.alert(` in component source. **Only `alert`.** Excluding `confirm`
and `prompt` is not cosmetic and both reasons belong in the rule's README:

- `ux/destructive-no-confirm`'s `unless` clause treats `window.confirm` as
  a *satisfactory* confirmation. Flagging it here would punish the fix the
  other rule prescribes — a ruleset contradicting itself across two
  categories.
- `rowy` binds its own `confirm` from `confirmDialogAtom`. 30 of its 33
  `confirm(` hits are calls to that local API, which neither the regex tier
  nor ast-grep can distinguish without binding resolution — the same
  honest limit `ux/onclick-non-interactive` already documents.

Narrowed to `alert` the rule is clean, and `rowy`'s remaining 3 hits are
genuine true positives (a duplicate-option warning raised via
`window.alert` in a settings panel), which is the right outcome: a control
can have a real finding.

**07 — `sec/weak-default-credential`, error, weight 3.**
`(password|passwd|pwd)\s*[:=]\s*["'](admin|password|123456|test123|admin123|changeme|demo…)`,
with **`excludePackageScriptTargets: true`**. The one control hit —
`saas-starter`'s `const password = 'admin123'` in `lib/db/seed.ts` — is the
direct target of its `db:seed` script, which is precisely the case
[ADR 0017](0017-disc-no-console-log-script-target-exemption.md) added that
flag for. Setting it silences the control without touching the pattern.

Ranked on stakes, not evidence: n = 1 repo, 2 findings
(`newattendanceapp/app/api/admin/test-users/route.ts`, a live route
handler rather than a seed script). If a rule defensible on measurement
rather than severity is wanted, this is the one to hold for a bolt.new or
Replit arm.

### 2. Ten candidates are refused, three because the corpus contradicts them

Recording the refusals is the substance of this record, not an appendix.
Each looked like an obvious rule before it was measured.

**Refused because the corpus contradicts them.** These are not "no signal"
outcomes — the corpus actively says the failure mode is elsewhere.

- **`sec/sql-string-interpolation`.** A naive pattern finds 12 hits in
  `theghost` and reads as a slam dunk. Every one is
  `@neondatabase/serverless`'s `sql` **tagged template** —
  ``sql`DELETE FROM ghost_users WHERE id = ${userId}` `` is parameterized
  by the tag, not concatenated. The other 38 corpus hits are error-message
  template literals containing the word `UPDATE`. **Zero true positives in
  13 repos.** A rule here would be a tagged-template detector shipped as a
  SQL-injection rule.
- **`sec/cors-wildcard`.** `Access-Control-Allow-Origin: '*'` fires on 3 AI
  repos and 0 controls, and **no file anywhere in the corpus sets
  `Allow-Credentials`**, which is what makes a wildcard exploitable. The
  one destructive function carrying it,
  `sports-on-the-go/supabase/functions/delete-user-account`, calls
  `auth.getUser()` on the caller's bearer token *before* escalating to a
  service-role client. The header is the Supabase function template's
  default. All four findings would be false positives.
- **`sec/rls-not-enabled`.** The expected headline finding for AI-built
  Supabase apps. Three corpus repos ship migrations and **all three enable
  row-level security on every table they create** — 17/16, 9/9 and 17/17
  `enable row level security` against `create table`.

**Refused on measurement.**

- **`qual/nothing-lints-this-repo`.** The tempting second `capability`-tier
  rule, which ADR 0030 names by name. Measured, it separates **backwards**:
  2 of 6 controls, 0 of 7 AI repos. `vercel/commerce` has prettier and no
  linter; `nextjs/saas-starter` has neither. All four Lovable apps ship
  `eslint.config.js` and both v0 apps keep a `lint` script. Same trap as
  ADR 0029's candidate B, in the opposite direction.
- **`disc/no-license`.** Generator Δ **+0.86**, the strongest number
  anything produced in this pass, and it is discarded — see section 3.
- **`sec/api-route-no-auth` (unscoped).** Framework Δ **−0.71** against a
  generator Δ of +0.10, and it fires on `saas-starter`'s Stripe webhook
  (which verifies a signature) and `commerce`'s revalidate route (which
  checks a secret). Unscoped, this is a "does this repo have Next.js API
  routes" detector. The `admin`-scoped form at rank 02 is the salvageable
  part.
- **`disc/env-not-gitignored`.** Framework Δ **+0.83** exceeds generator Δ
  +0.40. It reads the difference between Next's default `.gitignore` (which
  has `.env*`) and Vite's (which has `*.local`). It also fires on `cinny`,
  which reads no custom env vars at all. Same class as ADR 0029's candidate
  A.
- **`qual/select-star`.** 0/6 on controls, 3/7 on the AI arm — and the zero
  is structural. See section 3.
- **Any new `tok/*` rule.** ADR 0014's consequence stands unchanged: **no
  corpus repo ships an AI context file.** The two shipped `tok/*` rules
  still have zero real-world validation and the corpus cannot supply any
  for a third. Adding one would be shipping a rule whose only evidence is
  its own fixtures.
- **`sec/env-literal-fallback` (generic).** The shape
  `process.env.X || "<literal>"` looked like a generalization of rank 01.
  Across the 16 matching files, 14 of the literals are
  `"http://localhost:3000"`. The credential-shaped literal stays as rank
  01's pattern; the syntax is not the signal.

### 3. Two confounds are named, alongside ADR 0029's framework confound

ADR 0029 found that `category` and `stack` were perfectly correlated and
that any signal separating the arms was simultaneously separating the
frameworks. Two more confound classes are visible in this pass, and both
have been latent in the corpus since it was assembled.

**The selection confound.** `disc/no-license` scores a generator Δ of
+0.86 — 6 of 7 AI repos, 0 of 6 controls. It is worthless. The controls
were selected for being famous, team-maintained open-source projects
(3.9k and 6.8k stars, Vercel and shadcn reference apps), and that
population has a `LICENSE` by definition. The number measures the corpus's
own **admission criteria**, not the code.

This generalizes past one candidate. Any signal correlated with
*project maturity* — a LICENSE, a CONTRIBUTING file, an issue template, a
CODEOWNERS, a release history, a badge row — will separate this corpus
perfectly and will be measuring how the control arm was chosen. ADR 0029
fixed the framework confound by filling empty cells with real third-party
repos; the selection confound cannot be fixed that way, because the
admission standard (a maintaining team, sustained history, no generator
marker) *is* the thing being accidentally measured. The mitigation is to
recognize the class and refuse rules that fall in it, which is what
happens here.

**The library-presence confound.** `qual/select-star` scores 0/6 on
controls — and **no control repo in the corpus uses Supabase at all.**
Verified: none of `taxonomy`, `saas-starter`, `commerce`, `precedent`,
`cinny` or `rowy` declares any `@supabase/*` dependency. Every rule keyed
to a Supabase API therefore scores 0/6 on the control arm *by
construction*, whether or not it is a good rule, because the control arm
cannot exercise it.

This is not a hypothetical, and it is not confined to the refused
candidate — see section 5.

### 4. Ranks 05 and 08 are held, and why

Both are real defects. Neither ships in this batch.

**05 — `qual/catch-logs-only-in-component`: held for confound risk and
saturation.**

Its framework Δ is **+0.40** against a generator Δ of **+0.52**. By ADR
0029's own standard — "a signal whose framework delta rivals its generator
delta is measuring the template, not the provenance" — those are too close
to call it a provenance-bearing rule. The mechanism is legible: the four
Next.js controls are server-rendered and simply have few client-side
`catch` blocks, so the `.tsx` scoping that makes the rule *correct* is also
what ties it to the framework. It fires on 2/2 control/vite repos.

The second reason is independent of the confound. It produces **231
findings on the AI arm across 6 repos, 202 of them in `newattendanceapp`
alone**. A single rule at that volume saturates a report the way
`sec/no-hallucinated-imports` did on `rowy` before ADR 0030 — and ADR 0030
already recorded the lesson that `PER_RULE_PENALTY_CAP` makes finding count
and score movement only loosely coupled, so the cost is paid entirely in
readability with no scoring benefit. 202 findings would bury the 9
service-role keys that rank 01 exists to surface, in the same repo.

Held, not killed. If it ships later it ships on defect merit alone — the
ADR 0030 reasoning for `qual/no-typecheck-anywhere`, where "what earns it a
place is not the 100%" — and its separation is never cited. A per-file
finding cap would need to be settled first.

**08 — `qual/oversized-source-file`: held because it asks for new engine
capability to buy the batch's weakest separator.**

Generator Δ **+0.24** — the lowest of the eight — and it fires on 2/2
control/vite repos (`cinny` 5 files, `rowy` 2). That is not a bug: a
1,200-line component is a genuine maintainability finding wherever it
appears. But it does not separate the arms, and it is the only candidate in
the batch that **no existing tier can express**. Trading a new tier (or a
new check on the tokens tier, with the `gpt-tokenizer` cold-start cost
CLAUDE.md guards) for the weakest signal in the batch is the wrong order.

The engine work is specified in section 6 so it is not re-derived, and the
rule is resumable if a later batch wants it. It is **not** parked in
`packages/rules/_incubating/` — that convention (ADR 0014) is for a rule
that shipped and was pulled on precision grounds. This one was never
written.

### 5. `sec/edge-function-no-auth` and `qual/supabase-result-unchecked` are retroactively qualified

The library-presence confound is not a property of the refused candidate.
Both shipped Supabase-keyed rules score 0/6 on the control arm, and both
numbers mean less than they appear to.

| Rule | ctl/next | ctl/vite | ai/next | ai/vite | What the control zero means |
|---|---|---|---|---|---|
| `sec/edge-function-no-auth` | 0/4 | 0/2 | 0/3 | 1/4 | No control ships `supabase/config.toml`, so the rule's `files` glob matches nothing in six of thirteen repos |
| `qual/supabase-result-unchecked` | 0/4 | 0/2 | 1/3 | 2/4 | No control imports `@supabase/*`, so `await supabase…` cannot occur |

Neither rule is wrong, and nothing about them changes here. What changes is
what may be claimed for them: **their 0/6 on controls is not evidence of
precision.** It is the applicable-rule denominator being empty. A precision
claim for either requires a control repo that actually uses Supabase, and
the corpus does not contain one.

This is the same discipline ADR 0029 applied when it declined to read B2's
and C's 100% as established fact at n=2 generators, applied to a different
axis. It also sharpens ADR 0029's closing note that "a bolt.new or Replit
arm is the obvious next expansion": the more useful expansion for these two
rules specifically is a **control repo built on Supabase**, which would
populate the denominator without touching the generator axis at all.

### 6. Engine work this batch implies

Six of the eight ranked candidates are regex-tier and one is
capability-tier; only rank 08 needs anything new, and rank 08 is held.
Recorded here so it is not re-derived.

- **A line-count check, required for rank 08 only.** No tier answers "how
  big is this file". Preferred shape is a `lines` member on the `tokens`
  tier's discriminated pattern union — the same "discriminate the pattern
  payload, not the tier" move ADR 0012 established — **but only if it
  short-circuits on a raw newline count before `gpt-tokenizer` loads.**
  Running the tokenizer over 720 source files is exactly the hot-path cost
  CLAUDE.md forbids. A new `size` tier is the fallback. It must not ship as
  a regex counting newlines.
- **The `capability` tier gets its second caller, and it does not use
  `revokedBy`.** ADR 0030 put the tier on probation with a stated test: "if
  the next capability rule doesn't need a provider list, this should
  collapse back into something smaller." Rank 04 *does* use the provider
  list (three alternative providers) and does *not* use `revokedBy`. That
  is a pass on the test as written, and a note for the record that
  `revokedBy` remains justified by exactly one rule.
- **Rank 02 wants per-handler scoping the regex tier cannot give it.** A
  file-level `unless` means one authenticated handler in a route file
  suppresses findings on its unauthenticated siblings. It costs nothing on
  this corpus — no corpus file mixes both — and belongs in the rule's
  README as a known limit with the ast-grep rewrite named as the upgrade,
  the same path `sec/post-has-validation` already documents.
- **No new dependency.** Rank 01's `service_role` discrimination is
  deliberately solved by base64 alignment rather than by decoding JWTs in
  the engine.

## Consequences

- **Nothing shipped in this session.** No `rule.yaml`, no fixtures, no
  snapshot regeneration, no corpus diff. This record is the measurement
  that precedes those, per ADR 0029's separation of measuring from
  shipping. Ranks 01–04, 06 and 07 are cleared to be written; each still
  needs its `fixtures/bad` and `fixtures/good` suites and a corpus re-run
  with an explained diff before it merges.
- **Six rules would take the ruleset from 25 to 31**, against a v1.0 target
  of 40+. The corpus does not currently evidence nine more, which is worth
  stating plainly: ten candidates were refused here, and a further batch
  will need corpus expansion before it can be measured rather than guessed
  at.
- **Two confound classes are now named and neither is fixable by adding
  repos the way the framework confound was.** The selection confound is
  structural in the admission standard; the library-presence confound needs
  a specific *kind* of repo (a Supabase-backed control), not more repos.
  Both should be checked against any future candidate before its numbers
  are believed.
- **Two shipped rules' control-arm zeros have been downgraded from evidence
  to artifact.** `sec/edge-function-no-auth` and
  `qual/supabase-result-unchecked` keep their behavior and their place;
  what they lose is a precision claim nobody should have been making. The
  README's corpus tables do not currently make that claim for either rule,
  so nothing there is falsified — but a future write-up would have, which
  is why this is recorded rather than left implicit.
- **The highest-severity finding in this pass is one the shipped ruleset is
  blind to.** Two live Supabase service-role credentials in committed
  source, and `sec/no-secrets-in-code` — error, weight 4 — is silent. Rank
  01 should not wait for the rest of the batch.
- **Two candidates are held rather than killed, and the distinction
  matters.** Rank 05 and rank 08 have their reasons recorded above so
  whoever resumes them does not re-measure from scratch. Neither is parked
  in `_incubating/`: that convention is for a rule that shipped and was
  pulled, and neither of these was ever written.
- **`instruction/RULESET.md` and the README's open-items table are
  deliberately untouched.** They describe what ships; nothing ships here.
  They should be updated by the PR that adds the first rule from this
  batch, not by this record.
