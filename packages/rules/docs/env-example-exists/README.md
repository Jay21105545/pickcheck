# .env present with no .env.example

**Why AI does this:** an assistant wires up config by writing straight to
`.env` with real local values, because that's what makes the app run in
*this* session. `.env.example` documents the shape of the config for the
*next* session (a teammate, a fresh clone, a different AI agent) — nothing
about "make it run now" produces that file.

**What breaks:** anyone else cloning the repo has a `.env`-shaped hole
they can't fill without reading through the source for every
`process.env.X` reference, or asking the original author. It's the same
failure as a missing `README.md` "getting started" section, specific to
configuration.

**Detection:** exists tier, *conditional* via `pattern.when` — the check
for `.env.example` only runs if the repo actually has a real `.env` /
`.env.local` / `.env.production` on disk (reusing `sec/no-env-in-git`'s
glob, and excluding rule `fixtures/` the same way that rule does — an
intentionally-present fixture `.env` shouldn't make an unrelated repo's
missing `.env.example` look like a real finding). A repo with no env-file
at all isn't flagged, because there's nothing to document a template for. Known limits, both intentional v1
simplifications (see DECISIONS/0005): first, RULESET.md specs the
precondition as "code references `process.env.X`" — this uses "a real
`.env` file exists" as a cheaper glob-based proxy for that, rather than
parsing source for env-var references. Second, RULESET.md specs a
"coverage %, threshold 60%" check — does `.env.example` actually *mention*
the keys the code uses — which this v1 does not implement; it only checks
that `.env.example` exists at all, the same binary check as
`docs/changelog-exists`. Both are staged the same way RULESET.md itself
stages `sec/post-has-validation` as "regex v1 → astgrep v1.1". Also not
subproject-aware, same as `docs/api-doc-exists`: a `.env` anywhere under
the scanned root (a nested example app included) makes the check look for
`.env.example` at the scanned root.

## Fix prompt
> This repo has a `.env` file but no `.env.example`. Create
> `.env.example` at the repo root listing every key `.env` defines, with
> placeholder values instead of the real ones (e.g. `DATABASE_URL=` or
> `DATABASE_URL=postgres://user:pass@localhost:5432/db`). Never copy a
> real secret value into it.
