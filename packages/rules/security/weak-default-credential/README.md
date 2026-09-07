# Known-weak password literal in application code

**Why AI does this:** you ask for a way to try the app, or for test
accounts to demo a role-based UI, and the assistant needs a password to put
in the row it is creating. There is no good answer available to it — it
cannot generate a secret you will remember, and it cannot ask your password
manager — so it picks the thing that reads as obviously-a-placeholder:
`password123`, `admin123`, `changeme`. That is the correct instinct and it
would be fine in a scratch script.

What goes wrong is where the line ends up. The account-creation code is
usually written as part of an admin feature, so it lands in a route handler
rather than a seed script — and a route handler is not a local convenience,
it is a live endpoint. The placeholder stops being a placeholder the moment
the app is deployed, and nothing in the build flags it, because a string
literal is a string literal.

**What breaks:** the account is reachable by anyone who guesses the email,
and they do not have to guess the password — it is at the top of every
credential-stuffing list, which is exactly why the assistant chose a word
that "looks like a placeholder". A demo account is still an account: it
holds a session, it has a role, and in the corpus instance the role is not
"demo".

The corpus's two findings are in
[`newattendanceapp`](../../../../corpus/repos.json) —
`app/api/admin/test-users/route.ts`, which creates users with
`password: "password123"`. It is worth naming what compounds there: the
same file is flagged by `sec/admin-route-no-auth` because the handler has
no authorization check, and the table it writes to,
`three_test_users_info`, is the same table
`app/api/admin/user-credentials/route.ts` reads back with
`.select("email, password, …")` — also unauthenticated. A weak password, an
endpoint that mints accounts with it, and an endpoint that hands the row to
anyone who asks.

**Detection:** regex tier. A password-shaped identifier, an assignment, and
a *closed* literal drawn from a known-weak list.

The closing quote is the discriminator and it is load-bearing: without it,
any value merely *starting* with one of these words matches, including a
real hash that happens to begin with `admin`. Anchoring on the identifier
to the left of the `:`/`=` is what keeps the many places the word
"password" appears as a *value* out of scope — `type="password"`,
`placeholder="password"`, `autocomplete="current-password"`,
`name="password"` all have a different identifier on the left, and a schema
declaration like `password: z.string().min(8)` has no quoted literal at
all.

Each base word takes an optional short numeric suffix with an optional
separator, so `admin123`, `password123`, `demo_2024` and `admin@123` are
all the same credential as their base word. That generality is not
cosmetic: an earlier draft enumerated the combinations by hand, missed
`password123`, and found **zero** of the corpus's two real instances. A
final all-numeric branch covers `123456` and friends.

The list is closed rather than entropy-based on purpose. "Short or
low-entropy string assigned to a password" would fire on every truncated
example and placeholder in a codebase; these are the values an attacker
tries first, and nothing else. Hashed values cannot match at all — bcrypt
and argon2 digests start with `$`, outside every branch.

**The one exemption, and why it is not a carve-out.** A seed or setup
script legitimately hardcodes a throwaway password so a fresh local
database has something to sign in with. `nextjs/saas-starter` does exactly
that, and it is the corpus's only control hit. The rule sets
`excludePackageScriptTargets`
([ADR 0017](../../../../DECISIONS/0017-disc-no-console-log-script-target-exemption.md)),
which exempts a file that is the direct execution target of a `package.json`
script — `"db:seed": "npx tsx lib/db/seed.ts"`. That is machinery the
engine already had for this exact population, not something added for this
rule. Measured both ways: with the flag, 2 findings and no control hit;
without it, 3 findings including `saas-starter`.

**Known limits:**

- **A seed script that is not wired to a `package.json` script is still
  flagged.** The exemption keys on being reachable via `npm run`, not on
  being named `seed`. If you keep such a script, add it to the manifest
  (which is where it belongs anyway) or to `.pickcheckignore`.
- **It reads the literal, not the lifecycle.** A weak password that the
  code immediately forces the user to change on first login is still
  flagged, because that intent lives in another file.
- **Only literals.** A weak password assembled from variables, read from a
  config file, or held in a `.env` committed to the repo is invisible here.
  The committed-`.env` case is `sec/no-env-in-git`'s.
- **Password-shaped identifiers only.** A weak `pin`, `passphrase`,
  `masterKey` or `apiSecret` is the same defect under a different name.
  Widening the identifier list was not measured against the corpus and is
  not guessed at.

## Fix prompt

> `{{file}}` line {{line}} assigns a password that appears near the top of
> every credential-stuffing list. Treat it as public.
>
> 1. Tell me what this password is for: a real account, a seeded demo
>    account, or a fixture. Then tell me every environment this code path
>    runs in — if it can run anywhere but a developer's machine, the
>    account it creates is reachable from the internet.
> 2. If any account was ever created with it, that account is compromised.
>    Rotate its password, and check the sign-in logs for it before you do.
> 3. If this seeds local development data, move it out of application code
>    into a script wired to a `package.json` entry (`"db:seed": "..."`), and
>    read the value from an environment variable with the weak literal only
>    as a local fallback — never inline in a route handler, which is a live
>    endpoint.
> 4. If it seeds a *deployed* environment, generate a random password per
>    account at seed time, print it once, and store only the hash.
> 5. Never store the password itself. Show me where this value is written —
>    if a plaintext `password` column exists, replace it with a hash from
>    `bcrypt`/`argon2` and drop the plaintext column.
> 6. Check whether any endpoint reads this credential back out. An admin
>    route that returns a stored password is a second, separate defect, and
>    the two travel together.
