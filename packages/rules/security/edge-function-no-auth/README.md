# Edge Function deployed with JWT verification turned off

**Why AI does this:** the assistant writes an Edge Function, the developer
deploys it, and the browser call comes back `401`. The function is being
called before the user signs in, or from a page that doesn't forward the
session, or the assistant simply didn't wire the `Authorization` header.
The one-line fix that makes the error go away is
`verify_jwt = false` in `supabase/config.toml` — and it does make the error
go away, immediately and permanently, which is exactly why it survives into
production. Nothing later in the build ever produces a reason to turn it
back on.

**What breaks:** the function stops being part of your app and becomes a
public endpoint on the internet. It still runs with the project's
server-side environment — the service-role key, the model gateway key,
whatever else it reads from `Deno.env` — but now anybody who can read the
network tab, or guess
`https://<project-ref>.supabase.co/functions/v1/<name>`, can invoke it.

The corpus has two of these, both in
[`sports-on-the-go`](../../../../corpus/repos.json), and they are the
concrete version of the argument:

```toml
[functions.moderate-content]
verify_jwt = false

[functions.chat-sporty]
verify_jwt = false
```

Each one reads `LOVABLE_API_KEY` from the environment and forwards the
caller's message to `https://ai.gateway.lovable.dev/v1/chat/completions`
with `Bearer ${LOVABLE_API_KEY}` attached. There is no account check, no
per-user quota, and no rate limit — the functions handle a `429` from the
gateway by relaying it to the caller, which is error *reporting*, not
throttling. So a stranger with the URL has a free, unmetered LLM endpoint
billed to the project owner, and the first the owner hears of it is the
bill or the outage. `chat-sporty` will also accept an arbitrary `messages`
array, so the caller supplies the system prompt too: it isn't just a
metered model, it's an unmetered general-purpose one.

The same shape is worse when the function talks to the database, because
`SUPABASE_SERVICE_ROLE_KEY` is injected into every Edge Function and
bypasses row-level security by design. An unauthenticated function that
reads a table with the service-role client has no RLS between a stranger
and every row in it.

**Detection:** regex tier, one line — `verify_jwt = false` inside any
`supabase/config.toml`. This is a declaration, not an inference: it is
precisely the switch that tells the Supabase gateway to stop requiring a
valid bearer token. One finding per offending function, anchored at its
block. A function with no `[functions.<name>]` block, or a block with no
`verify_jwt` key, is not flagged — the platform default is `true`.

**Known limits:**

- **Third-party callbacks are a real exception and this rule does not know
  about them.** A Stripe webhook, a Twilio status callback, or a GitHub
  App event genuinely cannot present a Supabase JWT, so `verify_jwt =
  false` is the correct setting for it; the authentication moves into the
  function body as a signature check. The corpus contains no instance of
  this, so no exclusion is guessed at here — see
  [ADR 0028](../../../../DECISIONS/0028-backend-coverage-rules.md), which
  follows [ADR 0027](../../../../DECISIONS/0027-recall-drift-in-shipped-rules.md)'s
  precedent of recording an unmeasured class rather than coding against
  it. If your function is one of these, suppress it in
  `.pickcheckignore` and put the signature check in the body.
- **It reads the config, not the function.** A function that verifies the
  caller itself — parsing the `Authorization` header and calling
  `supabase.auth.getUser()` — is still flagged, because that correlation
  is cross-file and this tier is not. That is the deliberate trade: the
  config says "unauthenticated" and the burden of proof is on the code.
- Supabase only. Netlify and Vercel functions are public by default with
  no equivalent flag, so there is nothing to read.

## Fix prompt

> In `{{file}}` the Supabase Edge Function declared at line {{line}} is
> deployed with `verify_jwt = false`, which makes it callable by anyone on
> the internet who knows its URL, while it still runs with this project's
> server-side secrets.
>
> 1. Tell me what this function does and who is supposed to be able to call
>    it. If the answer is "signed-in users of my app", delete the
>    `verify_jwt = false` line so the gateway enforces authentication
>    again, then fix the caller to send the user's session — for a browser
>    client that means invoking it through `supabase.functions.invoke()`
>    with an active session rather than a bare `fetch`.
> 2. If it genuinely has to accept unauthenticated requests — an inbound
>    webhook from a payment or messaging provider — keep `verify_jwt =
>    false` and add the authentication the provider actually offers:
>    verify the request signature against the shared secret at the top of
>    the handler and reject anything that fails, before any other work.
> 3. If the function calls a paid API (an LLM gateway, an SMS or email
>    provider, a geocoder), show me where the spend is bounded. If it
>    isn't, add a per-user rate limit backed by a table keyed on the
>    authenticated user id, and cap the size of the input you forward.
>    Relaying the upstream provider's `429` to the caller is error
>    reporting, not a rate limit.
> 4. If it uses the service-role key, tell me which tables it touches and
>    why row-level security is being bypassed for each one. Replace the
>    service-role client with a user-scoped one anywhere the answer is
>    "no reason".
