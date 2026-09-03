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

**UI/UX:**

- `components/UserList.tsx` and `components/DeleteUserButton.tsx` fetch
  data with no loading, error, or empty state anywhere in the file
- `components/Avatar.tsx` renders an `<img>` with no `alt`
- `components/SearchBox.tsx` renders an `<input>` with no label
- `components/Card.tsx` has an `onClick` on a `<div>` with no `role`/`tabIndex`
- `components/SignupForm.tsx`'s submit button has no `disabled`/pending state
- `components/DeleteUserButton.tsx` calls a DELETE endpoint with no
  confirmation step
- `styles/theme.css` has more than the inline-hex-color threshold
- `components/Modal.tsx` has a hardcoded large pixel `width`

**Tokens:**

- `CLAUDE.md` is over its token budget
- `CLAUDE.md` and `AGENTS.md` share a duplicated paragraph verbatim
- `pnpm-lock.yaml` is present with no `.cursorignore`/`.claudeignore`
  (or equivalent) excluding it from AI-assistant context

Run `pickcheck audit` from this directory (or point `--rules-dir` at the
monorepo's `packages/rules` if running the CLI from source) to see every
finding, across all five categories.
