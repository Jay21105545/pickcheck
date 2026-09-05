---
"pickcheck": minor
---

Teach four shipped rules what a serverless, Supabase-shaped app actually
looks like, and implement `docs/env-example-exists` as RULESET.md §6
always specified it.

All four rules were calibrated against Next.js control repos and had
drifted from what their own READMEs claimed to detect. Measured against
the 8-repo backtest corpus:

- **`ux/destructive-no-confirm`** matched **0 of the 17** real delete call
  sites, because it knew only `axios.delete(` and `method: "DELETE"`. It
  now also matches `.delete()` with empty parens (the discriminator that
  separates a query-builder delete from `newSet.delete(id)` and
  `params.delete("q")`), `deleteDoc(`, and a `*delete*`/`*destroy*`-named
  Server Action bound via `action={…}` or `useActionState(…)`. `remove` is
  deliberately excluded — measured, it only ever fired on control repos,
  where it flagged a shopping-cart line-item removal.
- **`disc/no-console-log`** no longer flags `supabase/functions/**` or
  `netlify/{functions,edge-functions}/**`, where `console.log` is the
  platform's supported observability mechanism rather than leftover
  debugging. Removes 37 false findings from one corpus repo.
- **`sec/post-has-validation`** and **`docs/api-doc-exists`** now cover
  those same serverless directories. `sec/post-has-validation` also
  matches `req.body`/`request.body` and `await …req.json()`, where it
  previously hardcoded `request` for the `.json()` form and so saw none of
  the corpus's unvalidated bodies even once the glob was widened.
- **`docs/env-example-exists`** now triggers on the code actually reading
  environment variables (`process.env`, `import.meta.env`, `Deno.env.get`)
  and requires ≥60% of them to be documented, naming the missing keys —
  instead of only checking that `.env.example` existed at all whenever a
  `.env` was on disk. A key whose absence the code handles
  (`process.env.X && …`, `… ?? fallback`) is correctly treated as
  optional.

Adds a `coverage` tier to support that last one: set coverage between
identifiers extracted from source and identifiers declared in a
documentation file. All four control repos score identically before and
after; the ten new findings are all on the AI-generated arm, hand-reviewed
at 87.5% precision. See DECISIONS/0027.
