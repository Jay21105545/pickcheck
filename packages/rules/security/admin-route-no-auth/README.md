# Admin route handler with no authorization check

**Why AI does this:** the admin panel is built as a UI problem. You ask for
a page listing every user with a ban button, and the assistant builds the
page, the fetch, and the route handler behind it. The handler's job, as
stated, is "return the users" — so that is what it does. Authorization was
never part of the prompt, and nothing in the loop ever raises it: the page
is at `/admin`, you are the only person who knows the URL, and it works
the first time.

The gap is invisible in the browser precisely because the *UI* is gated.
The link is hidden behind an `isAdmin` check, the page redirects if you are
not signed in, and so every manual test passes. But the check lives in the
component; the route handler underneath it is a public HTTP endpoint, and
`curl` does not render React.

**What breaks:** anyone who can guess the URL gets the admin API. Not the
admin UI — the API, which is the part that actually touches the database.

The corpus has ten of these across two repos, and they are not
theoretical:

- `newattendanceapp/app/api/admin/user-credentials/route.ts` is a `GET`
  taking `?email=`, which runs
  `.select("email, password, role, full_name, staff_number, …")` and
  returns the row. An unauthenticated request retrieves a named
  employee's stored password from a payroll app.
- `newattendanceapp/app/api/admin/users/by-role/route.ts` builds a
  **service-role** client and enumerates the full user directory —
  ids, emails, names, roles, departments — for any role you ask for.
- `theghost/app/api/admin/users/delete/route.ts` is a `DELETE` that
  removes any user by id. `…/ban/route.ts` is the same shape.
  `…/users/[userId]/messages/route.ts` maps a user id to their
  `ghost_id` and display name — in an app whose entire premise is
  anonymous chat.

The pattern behind all of them is the same: the assistant put the door in
the right place and never fitted a lock, because nothing it was asked to
do required one.

**Detection:** regex tier. Two halves, and the scoping is the rule.

The `files` globs match a route file that lives under an `api` segment
*and* an `admin` segment — App Router `route.ts`, or a Pages Router
handler file. The path is what makes this precise: the unscoped version of
this rule, "an API route with no auth reference", was measured against the
corpus and rejected. It fires on `nextjs/saas-starter`'s Stripe webhook
(which verifies a signature) and `vercel/commerce`'s revalidate route
(which checks a secret), and its framework delta of −0.71 against a
generator delta of +0.10 marks it as a "does this repo have Next.js API
routes" detector rather than a defect detector. See
[ADR 0032](../../../../DECISIONS/0032-rule-batch-candidates-and-two-more-confounds.md).

The pattern then matches an exported HTTP method handler, in either export
form, so a route file exporting both `GET` and `DELETE` reports twice with
a line number for each.

`unless` suppresses the whole file on any plausible sign that it thinks
about who is calling — a session lookup, a user fetch, a role test, a
`401`, or even a bare mention in a comment. That is deliberately generous,
because this rule's value is precision: a missed finding is cheap, and a
false accusation on an admin route is not.

Two entries are load-bearing by their **absence**:

- **`service_role` is not an auth marker.** A handler reaching for the
  service-role key is bypassing row-level security, which is the opposite
  of authorizing its caller. Listing it would exempt exactly the worst
  handlers — `users/by-role` above is one.
- **`Authorization` is not one either.** `\bauth\b` cannot match
  `Authorization` (the trailing `o` defeats the word boundary), so a route
  that forwards an auth header without ever checking it is still flagged.

**Corpus precision:** 10 findings, hand-classified in full — **8 true
positives, 1 false positive, 1 arguable (89% excluding the arguable)**.

**Known limits:**

- **It reads the route's location, not what the route returns.** An admin
  endpoint that serves a static asset — a CSV import template, a schema
  export, a constant — has no data to protect and is still flagged. That
  is the corpus's one false positive,
  `newattendanceapp/app/api/admin/bulk-upload/template/route.ts`, which
  returns a fixed sample table with invented names in it. No exclusion is
  coded for it: "a handler with no dynamic data" is not something this
  tier can determine, and a `template`-shaped path exclusion would be
  fitting a rule to a single sample, which
  [ADR 0014](../../../../DECISIONS/0014-ruleset-calibration.md) exists to
  warn against.
  `newattendanceapp/app/api/admin/supabase-config/route.ts` is the
  arguable one: it discloses only whether env vars are set, which is a
  real information leak from an admin surface and also nearly harmless.
- **Auth in middleware is invisible to it.** `middleware.ts` matching
  `/api/admin/*` genuinely protects these routes, and this rule cannot see
  across files. Nothing in the corpus does this, so the cost is unmeasured;
  if your project protects admin routes centrally, add the matcher's path
  to `.pickcheckignore`. Correlating the two is the `astgrep`-tier upgrade
  path, the same one `sec/post-has-validation` documents.
- **The path segment must be exactly `admin`.** `app/api/admin-tools/…`
  or `app/api/internal/…` are not matched. Widening to a substring was not
  measured and is not guessed at.
- **It says nothing about *which* users are allowed.** A handler that
  checks the caller is signed in, but not that they are an admin, passes.
  Distinguishing authentication from authorization needs to read what the
  check does, which this tier does not attempt.

## Fix prompt

> `{{file}}` line {{line}} is an admin route handler that runs with no
> authorization check in the file — no session lookup, no user fetch, no
> role test. It is a public HTTP endpoint: the gate on the admin *page*
> does not protect it, because `curl` never renders the page.
>
> 1. Tell me what this handler reads or changes, and who is supposed to be
>    able to call it. If the answer is "administrators", it currently has
>    no way to know that.
> 2. Add the check as the **first** thing in the handler, before any
>    parsing or database work: resolve the caller from the request's
>    session, return `401` if there is none, then load their role and
>    return `403` if it is not an admin role. Read the role from the
>    database or a verified token claim — never from a request header,
>    query parameter, or body field, all of which the caller controls.
> 3. Do the same for every other handler exported from this file, and for
>    the sibling routes under the same `admin` path. Show me the list you
>    checked.
> 4. If this handler uses a service-role or admin database client, the
>    authorization check is the *only* thing standing between a stranger
>    and every row — say so explicitly in a comment above the client, and
>    confirm the check runs before it is constructed.
> 5. If several routes need the same check, put it in one helper and call
>    it from each handler. Prefer that over middleware if you want the
>    protection to be visible in the file it protects; if you do use
>    middleware, keep an assertion in the handler too so the route is not
>    silently exposed when a matcher changes.
> 6. Add one test per handler that calls it with no session and asserts a
>    `401`, so the gap cannot reopen.
