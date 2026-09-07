# Supabase service-role key exposed in source

**Why AI does this:** the assistant writes a query, the browser gets an
empty array back, and the reason is row-level security doing its job — the
anon key is scoped to what the signed-in user may see, and the policy isn't
written yet. There are two ways forward. One is to write the policy. The
other is to swap the key for the service-role key, which bypasses RLS
entirely, and the data appears instantly.

The second one is a single-token edit and it always works, so it is what
gets suggested and what gets kept. It then spreads: a script needs to
backfill a column, so it gets the same key; a route needs to read another
user's row, so it gets the key too. By the time anyone looks, the
credential is in a dozen files, and because it "worked" from day one there
was never a failure to prompt a second look.

The client-exposed variant has the same origin. `process.env.SUPABASE_SERVICE_ROLE_KEY`
is `undefined` in the browser — that is the platform working correctly —
and renaming it to `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` makes the
`undefined` go away.

**What breaks:** the service-role key is not an API key with elevated
scopes. It is the project's root credential. It bypasses **every**
row-level security policy on **every** table, and it is a bearer token, so
whoever holds it *is* the database — read, write, and delete on all rows,
including tables the app never queries. Supabase does not scope it by IP,
by table, or by anything else.

A key in committed source is a key in the git history, which means
rotating it is necessary but not sufficient: it has to be treated as
already compromised. The corpus instance is a public repository. Two
different projects' service-role keys sit in
[`newattendanceapp`](../../../../corpus/repos.json)'s `scripts/`
directory, both valid until 2034, in a staff attendance and payroll app
whose tables include stored user credentials.

The client-exposed variant is worse in one specific way: a
`NEXT_PUBLIC_`/`VITE_` variable is inlined into the JavaScript bundle at
build time, so the key is not merely leaked to anyone who reads the repo —
it is served to every visitor of the deployed site, and it stays in the
build output after the variable is renamed.

**Detection:** regex tier, two branches, no decoding.

A Supabase key is a JWT whose payload is
`{"iss":"supabase","ref":"<ref>","role":"<role>",…}`. Base64 encodes three
bytes to four characters, so a fixed substring of that payload has a
*deterministic* encoding once its byte offset mod 3 is known — and there
are only three possible offsets. Three literals therefore cover every
case, whatever the project ref's length:

```
Iiwicm9sZSI6InNlcnZpY2Vfcm9sZS
IsInJvbGUiOiJzZXJ2aWNlX3JvbGUi
iLCJyb2xlIjoic2VydmljZV9yb2xlI
```

Each is the invariant middle of base64url(`","role":"service_role"`) at
one alignment, with the leading and trailing characters — which depend on
the neighbouring bytes — trimmed off. Verified against both real
service-role tokens in the corpus and against synthesised tokens for every
project-ref length from 16 to 24 at all three alignments.

This is what lets the rule tell the two Supabase roles apart, which is the
entire point: `"role":"anon"` encodes to a different run of characters and
never matches. **The anon key is public by design** — it ships in every
browser bundle, and RLS, not the key's secrecy, is what protects the data
behind it. Flagging it at error severity would be telling you to rotate a
value that is supposed to be published.

The second branch matches a service-role key read from a client-exposed
env prefix (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `EXPO_PUBLIC_`). Those
prefixes are bundler instructions, not naming conventions, so the name
alone is the finding.

Unlike most rules that skip developer scripts, this one deliberately does
**not** set `excludePackageScriptTargets`
([ADR 0017](../../../../DECISIONS/0017-disc-no-console-log-script-target-exemption.md)).
A one-off script is exactly where this key gets pasted, and a committed
credential is committed whether or not `npm run` can reach the file.

**Known limits:**

- **Supabase only.** A Firebase admin service account, a Postgres
  connection string with superuser credentials, and a Mongo Atlas root URI
  are the same defect and none of them is matched here. No corpus arm
  exercises them, so no pattern is guessed at —
  [ADR 0028](../../../../DECISIONS/0028-backend-coverage-rules.md)'s
  precedent of recording an unmeasured class rather than coding against it.
- **The alignment trick depends on Supabase's payload shape.** If Supabase
  ever reorders the JWT claims so `"role"` no longer follows a `"`, or
  stops issuing HS256 JWTs entirely, the literals stop matching. That
  fails *closed* — a missed finding, never a false one — and the
  synthesised-token test in
  `packages/cli/test/rules/phase3-security-batch.test.ts` is what would
  catch it.
- **A key split across string concatenation is invisible**, the same
  limit `sec/no-secrets-in-code` documents for template-literal
  interpolation. There is no contiguous run of characters to match.
- **It reads the source, not the deployment.** A key that was already
  rotated still matches, because the rule cannot know that. That is the
  right way round: the burden of proof is on the credential's absence.

## Fix prompt

> `{{file}}` line {{line}} exposes this project's Supabase **service-role**
> key. That key bypasses row-level security on every table — it is the
> database's root credential, not an API key — and it is in the git
> history, so it must be treated as already compromised.
>
> 1. **Rotate it first, before changing any code.** Supabase dashboard →
>    Project Settings → API → roll the `service_role` key. Nothing below
>    matters until the exposed value is dead.
> 2. Find every other place it appears — search the working tree for the
>    key, and check `.env*` files, CI secrets, and deploy configs. Show me
>    the full list before you edit anything.
> 3. For each use, tell me why it needs to bypass RLS. Most do not: a route
>    that reads or writes rows *on behalf of the signed-in user* should use
>    a user-scoped client with the anon key and let RLS do its job.
>    Rewrite those and write the policy that was missing.
> 4. Where the service role is genuinely required — a scheduled backfill, an
>    admin-only operation, a webhook with no user session — move it behind a
>    server-only environment variable with **no** `NEXT_PUBLIC_`/`VITE_`
>    prefix, read it only in server code, and add an explicit authorization
>    check at the top of each such handler.
> 5. If the key was ever behind a client-exposed prefix, assume it was
>    served to the public: rotating is mandatory, and rebuild and redeploy
>    so the old value leaves the build output.
> 6. Do not add the key to `.env.example`. Put the *name* there with an
>    empty value and a comment saying it is server-only.
