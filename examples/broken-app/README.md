# broken-app

A small, deliberately bad Next.js-shaped repo. It exists to give
`pickcheck audit` something to find — every problem in it is intentional:

- a hardcoded Stripe-shaped secret in `lib/config.ts`
- a `.env` file that isn't git-ignored
- no `CHANGELOG.md`
- an API route (`app/api/users/route.ts`) with no `API.md` or OpenAPI spec
- no `.env.example` alongside the tracked `.env`
- a `console.log` left in `app/api/users/route.ts`
- `app/api/users/route.ts` reads `await request.json()` with no validation
  library referenced anywhere in the file
- an empty `catch` block in `lib/api-client.ts`'s `deleteUser`
- a bare, unhandled `fetch()` in `lib/api-client.ts`'s `fetchUser` (no
  try/catch, no `.ok` check, no `.catch`)
- `lib/analytics.ts` imports `posthog-node-lite`, which is not declared in
  `package.json` (nor does it exist on npm) — a hallucinated import

Run `pickcheck audit` from this directory (or point `--rules-dir` at the
monorepo's `packages/rules` if running the CLI from source) to see all ten
findings.
