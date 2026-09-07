# Hardcoded secret in source

**Why AI does this:** an assistant asked to "wire up Stripe" or "add S3
uploads" will often paste a working key straight into the file it's
editing, because that's the fastest way to produce code that runs *right
now* in the same session. Nothing in the prompt asked for secret
management, so nothing appears — the key just goes where the code needs
it.

**What breaks:** a committed key is a committed key forever, even after
you delete it in a later commit — it's in the git history, in every clone,
in every fork, and in every CI log that ever printed a diff. Scanners
(including GitHub's own secret scanning) and scrapers watch public repos
specifically for these patterns; a live Stripe or AWS key gets used within
minutes of becoming visible.

**Detection:** regex tier. One combined pattern catches five shapes. Four
are *shape*-anchored, meaning the credential identifies itself and no
variable name is involved: Stripe-style `sk-...`, AWS access key IDs
(`AKIA...`), GitHub tokens (`ghp_...`), and a JWT. The fifth is
*name*-anchored: a generic `(api_key|secret|token) = "..."` assignment,
case-insensitive.

The JWT branch closes a recall gap
([ADR 0033](../../../../DECISIONS/0033-security-batch.md)). Until it
existed, the name-anchored branch was the only one that could catch a
credential without a vendor prefix — and a credential passed
*positionally* never touches a name. `createClient(url, "eyJ...")` reads
its key as argument two, so there is no `key =` to anchor on and this rule
stayed silent on it. A JWT is three dot-separated base64url runs each
beginning `eyJ`, because a JSON object starts `{"`; that is
self-identifying, and it is the most common credential shape in a
JavaScript app that has no vendor prefix.

**The JWT branch deliberately excludes Supabase-issued tokens**, whose
payload begins `{"iss":"supabase"` → `eyJpc3MiOiJzdXBhYmFz`. Both Supabase
roles are handled elsewhere and neither belongs here. The `service_role`
key is [`sec/hardcoded-service-role-key`](../hardcoded-service-role-key/README.md)'s,
which names the role and explains that it bypasses row-level security;
matching it here too would bill one defect to two error-severity rules,
and the scorer's diminishing-returns curve
([ADR 0009](../../../../DECISIONS/0009-scoring-diminishing-returns.md))
charges real points for the second. The `anon` key is not a secret at
all — Supabase ships it to every browser by design — so this rule's own
advice, *rotate it*, would be wrong at error severity behind a composite
gate.

Widening the name-anchored branch instead was measured and rejected:
adding backticks to the quote class, and adding
`password`/`passwd`/`credential`/`private_key`/`access_key`/`anon_key` to
the name list, gains **zero** findings across all 13 corpus repos.

It's a v1 heuristic with real limits: it scans raw
lines, so it can't tell code from a comment inside a `.ts`/`.js`/etc. file
— a key-shaped string in a source-file comment will still trigger, which
is the price of not needing a full parser. Markdown files and this rule's
own fixtures are excluded from the file scope, so docs and this repo's
test samples don't get flagged as if they were real leaks.

A secret pasted whole into a template literal is still caught
(`fixtures/bad/template-string.ts`) — the pattern doesn't care which quote
character surrounds a matching run of characters, so backticks are no
safer than quotes. **Known limit this tier provably can't close:** a
secret whose characters are *split across template-literal
interpolation* — `` `sk-${"1234567890"}${"abcdefghijklmnop"}` `` — leaves
no single contiguous run of 20+ matching characters anywhere in the
source text, so the pattern has nothing to match. This isn't fixed here
with a fixture that pretends otherwise; closing it needs either
string-constant-folding (evaluate what the template literal would
concatenate to) or a much lower-precision "any template literal touching
a variable named like a secret" heuristic that would trade this false
negative for a flood of false positives on unrelated string building.
Deferred honestly rather than faked.

## Fix prompt
> Remove the hardcoded secret at {{file}} and replace it with a read from
> `process.env` (or your framework's config/secrets mechanism). Add the
> variable name to `.env.example` with a placeholder value, confirm
> `.env` is git-ignored, and rotate the real credential wherever it was
> issued — assume it's already compromised since it was committed.
