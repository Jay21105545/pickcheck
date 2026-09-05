# Supabase query result discarded, so its error is invisible

**Why AI does this:** every other async API the assistant has ever written
rejects on failure. `fetch` rejects on a network error, `prisma` throws on
a constraint violation, `axios` throws on a 4xx. So the generated code
puts the call in a `try`/`catch`, or just `await`s it as a statement, and
moves on to the success toast — because in that mental model, reaching the
next line *means* it worked.

supabase-js does not work that way. Its query builder is a thenable that
resolves — always — with `{ data, error }`. A write blocked by row-level
security, a unique-constraint violation, a column that doesn't exist, an
expired session: all of them resolve. None of them throw. So:

```ts
try {
  await supabase.from("posts").insert({ title, content });
} catch (error) {
  console.error("Failed to post:", error);   // never runs
}
toast.success("Posted!");                     // always runs
```

The `catch` is not a safety net here; it is decoration. That makes this
strictly worse than the empty `catch` that `qual/no-empty-catch` finds — an
empty catch at least admits nothing is being done, whereas this looks
handled to every reviewer who skims it, including the next AI assistant
asked to work on the file.

**What breaks:** the write silently doesn't happen, and the UI says it
did. Row-level security is the usual cause and the worst one, because it
fails *per user*: the developer's own account has a row in the table, the
policy passes for them, the feature demos fine, and it fails only for the
users whose policy doesn't match — silently, in production, at a rate
nobody is measuring. There is no exception, no log line, and no failed
request in the network tab (the HTTP call itself returns cleanly).

The corpus has nine of these across two repos. The clearest is
[`sports-on-the-go`](../../../../corpus/repos.json)'s
`src/contexts/AuthContext.tsx:110`, which updates the signed-in user's
`last_login_at`, discards the result, and then renders `Welcome back!`
regardless. Three more insert a row into `community_members` right after
creating a community or joining a game — so the failure mode is "you
created a community and are not a member of it", reported as
`Community created!`. Two are in `mindtrack`'s `chat` Edge Function, where
the discarded write is the *rate-limit counter*: if that write fails, the
limiter reads a stale count forever and stops limiting, which turns a
quality bug into a spend bug.

**Detection:** regex tier. The signal is `await` in **statement
position** — a line that begins `await supabase…`, so nothing binds,
returns, or otherwise consumes the `{ data, error }` the call resolves to.
Every way of keeping the result puts a different token first
(`const { error } = await …`, `const res = await …`, `return await …`,
`x = await …`) and cannot match. Two forms are accepted after the client:
end-of-line, which is how a multi-line `.from().update().eq()` chain is
formatted, and `.from(` / `.rpc(` / `.functions.invoke(` on the same line.

**Known limits:**

- **Scoped to data operations.** `supabase.auth.*` and
  `supabase.storage.*` are excluded on measurement, not oversight: across
  the corpus they add six findings — four `auth.signOut()` calls, whose
  failure the next page load corrects, and two `storage.remove()` cleanups
  of a file that is being orphaned anyway — and none of them would change
  what a developer does. See
  [ADR 0028](../../../../DECISIONS/0028-backend-coverage-rules.md).
- **Bound-but-never-read is not detected.** `const res = await
  supabase.from(…)` followed by nothing that touches `res.error` is the
  same bug, and this rule is quiet about it. Distinguishing "bound and
  checked" from "bound and ignored" needs dataflow, not a line pattern.
- **Fire-and-forget without `await` is not detected either** — a bare
  `supabase.from(t).insert(x);` statement, or one inside a
  `Promise.all([...])` whose aggregate result is discarded. The
  `Promise.all` shape appears in the corpus and is deliberately not
  matched, because the array elements are indented identically to a
  discarded statement and the discriminator would be lost.
- The client has to be named `supabase*`. A codebase that wraps it in a
  repository layer or renames it `db` is invisible to this rule.

## Fix prompt

> In `{{file}}` at line {{line}}, a Supabase call's result is discarded.
> supabase-js never throws on a failed query — it resolves with
> `{ data, error }` — so this failure is currently invisible, and any
> surrounding `try`/`catch` does nothing for it.
>
> 1. Destructure the result: `const { error } = await supabase…`.
> 2. Handle `error` before anything downstream runs. If the code after it
>    tells the user the operation succeeded (a toast, a redirect, a state
>    update), that path must not be reachable when `error` is set — show
>    the failure instead.
> 3. Then check every other Supabase call in this file for the same shape,
>    including ones already inside a `try`/`catch`, and tell me which of
>    them could fail for a *different* user than me because of a
>    row-level-security policy rather than a bug in the query.
