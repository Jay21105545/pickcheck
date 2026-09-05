# Environment variables the code needs aren't documented in .env.example

**Why AI does this:** an assistant wires up config by writing straight to
`.env` with real local values, because that's what makes the app run in
*this* session. `.env.example` documents the shape of the config for the
*next* session (a teammate, a fresh clone, a different AI agent) — nothing
about "make it run now" produces that file. And when a later session adds
one more integration, it adds the new key to the code and to its own
`.env`, not to the template nobody is reading.

**What breaks:** anyone else cloning the repo has a `.env`-shaped hole
they can't fill without reading through the source for every
`process.env.X` reference, or asking the original author. The failure is
usually silent rather than loud: the app boots, and one feature is dead.
In `sports-on-the-go` the undocumented key is `LOVABLE_API_KEY`, which two
Supabase Edge Functions require — clone that repo, deploy it, and the
chatbot and the content moderator simply never work.

**Detection:** `coverage` tier — a set relation, not a file-presence
check. Collects every environment key the code *reads* (`process.env.X`,
`process.env["X"]`, `import.meta.env.X`, `Deno.env.get("X")`), collects
every key `.env.example` / `.env.sample` / `.env.template` *declares*, and
flags one finding when fewer than **60%** of the required keys are
documented. The missing key names go in the fix prompt.

This is RULESET.md §6 as originally specified. The shipped v1 implemented
neither half of it: it triggered on "a `.env` file exists on disk" rather
than on "code references `process.env.X`", and it checked only that
`.env.example` existed at all, never that it mentioned anything the code
uses. Both gaps are closed in
[DECISIONS/0027](../../../../DECISIONS/0027-recall-drift-in-shipped-rules.md),
which also introduced the tier. Practical consequence of the precondition
change: a repo that reads env vars and ships *neither* file used to score
clean and now doesn't, while a repo with a `.env` but no env reads at all
is no longer flagged.

**A key whose absence the code handles is not a required key.** This is
the rule's one real subtlety and it is carried by `pattern.optionalRegex`.
A read used as a value-expression whose falsy branch is handled —
`process.env.X && {…}`, `… ?? fallback`, `… || default`, `… ? a : b` — is
an *optional* setting, and demanding it be documented is a false positive.
steven-tey/precedent's `GITHUB_OAUTH_TOKEN` is exactly this: it raises the
GitHub API rate limit when set, the code works fine when it isn't, and it
is deliberately absent from that repo's `.env.example`. It flagged during
0027 calibration and `fixtures/good/src/optional.ts` is its real shape.

The mirror case stays required on purpose: the assign-then-assert pattern
(`const K = Deno.env.get("K"); if (!K) throw …`) is the code declaring the
variable **mandatory**, so it is not exempt. That's how `LOVABLE_API_KEY`
reads, and it's the difference between "this may be unset" and "this must
not be unset."

**Known limits.**
- **Optionality is repo-wide, not per-reference.** One guarded read
  anywhere exempts the key everywhere. That's the intended reading — the
  author has stated the value may be unset — but it does mean a key that
  is optional in one module and required in another is treated as
  optional.
- **A percentage threshold is weak for small key sets.** With three
  required keys, one undocumented key is 67% and passes. That is
  RULESET.md §6's specified 60% behaving exactly as specced, and it is why
  `sports-on-the-go`'s genuinely-missing `LOVABLE_API_KEY` does *not*
  produce a finding. Changing it (an absolute floor alongside the ratio,
  say) is a scoring change and needs its own decision record.
- **Not subproject-aware.** Keys read anywhere under the scanned root are
  checked against a `.env.example` at the scanned root, so a monorepo with
  per-package env templates will look under-documented.
- **Platform-injected keys are an explicit list**, not inferred:
  `NODE_ENV`, `CI`, `PORT`, `HOST`, `VERCEL*`, `NETLIFY*`, `AWS_*`,
  `DENO_*`, `NEXT_RUNTIME`, and the `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` set the Edge runtime
  supplies automatically. A key some other platform injects will be
  reported until it's added here.

## Fix prompt
> This repo reads environment variables that `{{file}}` doesn't document.
> Add every missing key listed in the finding detail to `{{file}}`, with a
> placeholder value rather than the real one (e.g. `DATABASE_URL=` or
> `DATABASE_URL=postgres://user:pass@localhost:5432/db`), and a one-line
> comment above each saying what it's for and where to obtain it. Never
> copy a real secret value into it. If a key is genuinely optional, make
> that explicit in the code — read it as `process.env.KEY ?? fallback` or
> guard it with `process.env.KEY && …` — so both the next reader and this
> check can tell a nice-to-have from a hard requirement.
