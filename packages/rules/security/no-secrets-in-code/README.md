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

**Detection:** regex tier. One combined pattern catches four shapes:
Stripe-style `sk-...`, AWS access key IDs (`AKIA...`), GitHub tokens
(`ghp_...`), and a generic `(api_key|secret|token) = "..."` assignment,
case-insensitive. It's a v1 heuristic with real limits: it scans raw
lines, so it can't tell code from a comment inside a `.ts`/`.js`/etc. file
— a key-shaped string in a source-file comment will still trigger, which
is the price of not needing a full parser. Markdown files and this rule's
own fixtures are excluded from the file scope, so docs and this repo's
test samples don't get flagged as if they were real leaks.

## Fix prompt
> Remove the hardcoded secret at {{file}} and replace it with a read from
> `process.env` (or your framework's config/secrets mechanism). Add the
> variable name to `.env.example` with a placeholder value, confirm
> `.env` is git-ignored, and rotate the real credential wherever it was
> issued — assume it's already compromised since it was committed.
