---
"pickcheck": minor
---

Add three rules for the backend seam — the layer the ruleset had no
vocabulary for — plus a `when` precondition on the regex tier.

Every previous rule assumed the app's data layer either throws on failure
or goes out over `fetch`. The AI-generated arm of the backtest corpus is
Vite + React + Supabase, where neither is true, and re-reading it by hand
found three defect classes nothing was looking for:

- **`sec/edge-function-no-auth`** (error) — a Supabase Edge Function
  declared `verify_jwt = false` in `supabase/config.toml`. That flag makes
  the function callable by anyone who learns its URL while it still runs
  with the project's server-side secrets. The corpus has two, both
  unauthenticated proxies that forward the caller's input to an LLM
  gateway on the owner's API key with no quota and no rate limit.
- **`qual/supabase-result-unchecked`** (warn) — a Supabase call whose
  result is discarded. supabase-js never throws; it resolves with
  `{ data, error }`, so a write blocked by row-level security returns as
  success and a surrounding `try`/`catch` does nothing. Nine in the
  corpus, including one that discards a `profiles` update and then renders
  "Welcome back!", and two that discard the write to a rate-limit counter.
  Scoped to `from`/`rpc`/`functions.invoke`; `auth` and `storage` are
  excluded on measurement.
- **`qual/simulated-backend`** (warn) — a submit, checkout or save handler
  whose only asynchronous work is `await new Promise(r => setTimeout(r,
  ms))`, in a file that makes no network call at all. The corpus case
  collects card details, waits 1.5s, and renders "Payment Successful!".
  Deliberately narrow: triggering on any `setTimeout` under the same
  conditions catches two more real cases but takes a debounce, an
  optimistic-UI revert and a toast timer with it.

The regex tier gains `pattern.when`, the mirror of the existing
`pattern.unless`: a whole-file content precondition, so a rule can require
context that isn't on the matched line. Existing rules are unaffected.

All four control repos score identically before and after. The thirteen
new findings are all on the AI-generated arm, every one hand-classified:
12 true positives, 1 arguable, 0 false positives. See DECISIONS/0028.
