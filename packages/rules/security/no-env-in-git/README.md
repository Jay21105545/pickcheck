# .env file tracked in the repo

**Why AI does this:** an assistant scaffolding a new project writes a
`.env` with working local values so the app runs immediately, and either
forgets to also write a `.gitignore` entry for it, or writes the
`.gitignore` *after* `.env` was already staged and committed in an
earlier turn — by the time the ignore rule exists, the file is already in
history.

**What breaks:** every value in that file — database URLs, API keys,
session secrets — is now in the git log permanently, readable by anyone
with clone access, and re-exposed every time the repo is mirrored, forked,
or made public later.

**Detection:** exists tier, `mode: absent` — a finding fires for every
`.env` / `.env.local` / `.env.production` the scanner sees (excluding
this rule's own `fixtures/` samples, which are intentionally "bad" test
data, not a real leak). The scanner
itself is `.gitignore`-aware (same as `git status`), so a `.env` that's
properly ignored never appears in the scanned file list and never
triggers — that's the "not mere presence" the spec asks for. Known limit:
this checks *on-disk presence filtered by the current `.gitignore`*, not
the actual git index (`git ls-files`). It correctly misses a properly
ignored `.env`, and correctly catches one sitting unignored on disk — the
one case it can't see is a `.env` that was committed in the past and
*later* added to `.gitignore` (still tracked, but no longer visible to a
gitignore-aware scan). Catching that needs an actual `git ls-files` call,
left for a follow-up since it adds a subprocess dependency the exists tier
doesn't otherwise need.

## Fix prompt
> `{{file}}` is a `.env` file that isn't git-ignored. Add its path to
> `.gitignore`, then run `git rm --cached {{file}}` if it was already
> committed. Rotate every credential it contained — assume they're
> compromised. Create a `.env.example` alongside it with the same keys and
> placeholder values so the repo stays runnable without the real file.
