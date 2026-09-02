# API surface detected with no API.md or openapi spec

**Why AI does this:** an assistant asked to "add an endpoint" adds the
route handler — that's the literal ask. Nobody asked for documentation of
the endpoint, so a route can accumulate a dozen handlers with no single
place that lists what they are, what they take, or what they return.

**What breaks:** the next person (human or AI) working on the frontend, or
integrating the API from outside, has to read route source files one by
one to reconstruct the surface — there's no single source of truth for
"what does this API do."

**Detection:** exists tier, *conditional* via `pattern.when`. The check
for `API.md` / `openapi.{json,yaml,yml}` only runs if the repo actually
has an API surface — `app/api/**` or `pages/api/**` (Next.js), `routes/**`
or `src/routes/**` (Express-style), or a top-level `api/**`. A repo with
none of those paths (a CLI, a static site, a library with no server) never
gets flagged for missing API docs, because it doesn't need any. Known
limits: the API-surface check is path-convention-based, not content-based
— it won't recognize a FastAPI or Express app that puts its routes
somewhere unconventional (RULESET.md's spec mentions "fastapi/express
markers" as an alternative detection signal; that would mean grepping file
contents for `FastAPI()` / `express()`, which this v1 doesn't do — see
DECISIONS/0005). And once the precondition *is* met, this only checks
that one of the doc files exists, not that it's actually up to date with
the routes. It also isn't subproject-aware: in a monorepo, an API surface
anywhere under the scanned root (including a nested example/demo app)
makes the check look for `API.md` at the scanned root, not next to the
API surface itself.

## Fix prompt
> This repo has an API surface (routes under {{file}}'s sibling paths) but
> no `API.md` or OpenAPI spec. Read every route handler under `app/api/`,
> `pages/api/`, or `routes/` and write `API.md` listing each endpoint's
> method, path, request shape, response shape, and auth requirements. Run
> `pickcheck gen api` if available to seed it from the real route code.
