# ADR 0023 — Build output is never audited: a default ignore set plus a content heuristic

**Status:** accepted · **Date:** 2026-09-04

## Context

The first real-world run of `pickcheck audit` on a Next.js app returned
49 findings, **~45 of them from `.next/`** —
`.next/server/vendor-chunks/`, `.next/static/chunks/polyfills.js`,
`webpack.js`, `main-app.js`. Build artifacts, not source. Nothing in that
list is actionable: you cannot fix an empty catch block inside a webpack
runtime chunk. It made the tool unusable for any Next.js user on first
run, which is most of the target audience.

### Root cause: not one bug, three

`.gitignore` parsing is **not** broken — a root-level Next.js
`.gitignore` containing `/.next/` is honored correctly, confirmed by
direct reproduction. The leak has three independent causes, and any one
is sufficient:

1. **No default ignore set.** `scanRepo` force-ignored only `.git/`,
   `node_modules/`, and the ignore files themselves. A repo with no
   `.gitignore` — or one that doesn't happen to list a given build dir —
   gets its entire build output audited.
2. **Anchored root patterns don't reach nested apps.** In a monorepo, a
   root `.gitignore`'s `/.next/` is anchored to the root by design and
   correctly does *not* match `apps/web/.next/`. Git copes because it
   also reads nested `.gitignore` files. We don't:
3. **Only the root `.gitignore` is ever read.** `readIgnoreFile(cwd,
   ".gitignore")` reads exactly one file. Git reads `.gitignore` at every
   directory level, so `apps/web/.gitignore` — the very file a Next.js
   app in a monorepo keeps its `/.next/` rule in — is invisible to
   pickcheck.

All three were reproduced against real directory layouts before any fix
was written.

## Decision

**Build output is excluded by default, and the default is overridable.**

`DEFAULT_IGNORED` (gitignore syntax, so it matches at any depth —
`dist/` catches `apps/web/dist/` too) covers `.next/`, `dist/`, `build/`,
`out/`, `.output/`, `.svelte-kit/`, `.nuxt/`, `.turbo/`, `.vercel/`,
`coverage/`, `__pycache__/`, `target/`, plus `*.min.js`, `*.min.css`, and
`*.bundle.js`.

`.pickcheck/` is in that list too, found while fixing this: pickcheck's
own `report.html` is generated markup with inline JS that trips our own
rules, and `history.json` is state. Auditing them would mean a repo's
score changing simply because it had been audited before.

Precedence follows gitignore's own: **defaults, then `.gitignore`, then
`.pickcheckignore`** — so the user's file has the last word and `!dist/`
re-includes a default-ignored directory. This is distinct from
`ALWAYS_IGNORED` (`.git/`, `node_modules/`), which stays non-negotiable.

For speed, non-negated defaults are also passed to fast-glob so a
10,000-file `.next/` is never walked at all. Whether the user negated a
default is decided by `ignore`'s own matcher rather than by parsing
gitignore syntax by hand — applying the default *and then* the user's
file and asking whether a probe path still ends up ignored. (Testing the
user's patterns alone does not work: `ignore` reports `unignored: true`
only when a negation overrides a rule in the same filter, so a lone
`!dist/` reports nothing.)

### Content heuristic, and why it measures the *mean* line length

A named list only covers bundlers we've heard of, so files are also
classified by content: a `sourceMappingURL` comment, or a mean line
length of 500+, marks a file as generated. Only code-ish extensions are
sniffed (a long line in Markdown or JSON says nothing), and only the
first 64KB is read.

The first implementation used **maximum** line length, threshold 1,000 —
and the corpus caught it immediately. `taxonomy`'s
`app/api/og/route.tsx` is a hand-written 148-line Next.js route whose
inline SVG logo is a single 1,664-character `<path d="...">`. The
heuristic silently dropped the file, hiding two genuine
`qual/fetch-has-error-handling` findings and moving that repo's composite
79.54 → 89.42. A score going *up* because the scanner quietly stopped
looking is the worst possible failure mode for an audit tool.

Averages separate the two cleanly where maxima do not. Measured on real
corpus source: 32-50 chars/line even for the file with the 1,664-char
line. Minified output has few lines of many thousands each. The
threshold sits an order of magnitude above observed source.

The asymmetry drove the choice: auditing one extra file is mild noise;
silently skipping real source hides real bugs. The heuristic errs toward
keeping files.

## Consequences

- A Next.js-shaped fixture (`packages/cli/test/fixtures/nextjs-app`) with
  a realistic `.next/` full of rule-tripping build output is asserted to
  produce **zero** findings from it, while still producing findings from
  the app's real source — so the fixture can't pass vacuously.
- `packages/cli/tsconfig.json` excludes `test/fixtures`, and `biome.json`
  excludes `packages/cli/test/fixtures`: fixture repos are audit *input*,
  deliberately shaped like someone else's project (JSX without our
  compiler options, output invalid under our module settings), and must
  keep that exact shape. Same treatment `packages/rules/**/fixtures`
  already gets.
- Corpus: **no diff** across all 8 repos after the mean-line-length fix.
- **Still open — nested `.gitignore` files are not read.** The default
  set makes the reported bug moot for known build directories, but a
  repo that ignores, say, `apps/web/generated/` in a nested `.gitignore`
  will still have it audited. Fixing that means walking every directory's
  `.gitignore` with correct per-directory precedence, which is a real
  behavioral change that could legitimately move corpus snapshots. It is
  deliberately *not* bundled into this fix, and should get its own record
  and corpus review.
