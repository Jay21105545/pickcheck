# `qual/no-typecheck-anywhere`

**Nothing in this project ever runs the TypeScript compiler.**

Not a `typecheck` script, not a CI step, not a framework build that would
fail on a type error. The `.ts` extensions, the `strict: true` in
`tsconfig.json` and the `typescript` devDependency are all still there —
they just aren't connected to anything that checks them.

## Why AI builders produce this

Two independent routes, and the corpus has both.

**Vite scaffolds don't type-check.** `vite build` uses esbuild, which
*strips* types rather than checking them. A Vite + React + TS starter with
no `typecheck` script is type-checked only by the author's editor — so it
holds exactly as long as someone is looking at the file. All four Lovable
apps in the corpus are this shape, because the
`vite_react_shadcn_ts` template they start from is.

**Next.js type-checks, and the template turns it off.** `next build` fails
on a type error by default. All three v0-generated apps in the corpus ship

```js
// next.config.mjs
typescript: { ignoreBuildErrors: true },
```

which switches that off. It is a defensible line in a scaffold — the
generated code has to build on the first try, before the user has written
anything — and it is nearly always still there later, when the project is
real and the guarantee it disabled is one the author now believes they
have.

That is the trap this rule is really about. The failure isn't "no types";
it's a project that *looks* type-safe by every visible signal while nothing
enforces it.

## What breaks in production

Type errors reach runtime as `undefined is not a function`, a mis-shaped
API payload silently destructuring to `undefined`, a renamed field that
still compiles because nothing compiled. The specific danger of a
suppressed check is that the codebase accumulates these quietly: with no
gate, every refactor adds a little more drift, and the day someone *does*
run `tsc` they get hundreds of errors at once and turn it back off.

## How this rule decides

It asks one question — *would a type error be caught by anything?* — and
accepts any of three answers:

1. a `package.json` script that runs `tsc`/`vue-tsc`, matched on the
   script's **name or its command**, so `"build": "tsc && vite build"`
   counts even though nothing is called `typecheck`;
2. a CI job that runs it;
3. a Next.js build — **unless** `typescript.ignoreBuildErrors` is set,
   which revokes it.

Point 3 is the substance. Read without it, the rule fires on every
well-maintained Next.js repo in the corpus (4/4 controls) because none of
them needs a separate script — and its measured accuracy as a
provenance signal drops from 100% to 69%. See
[DECISIONS/0029](../../../../DECISIONS/0029-corpus-confound-and-expansion.md)
for the measurement and
[DECISIONS/0030](../../../../DECISIONS/0030-two-false-positives-and-two-rules.md)
for the shipping decision.

## Limits worth knowing

`ignoreBuildErrors: true` is a v0 template default, so on the Next.js side
this is one generator's default observed three times, not three
independent observations. And a `tsc` invocation that CI never actually
calls — a script present but unwired — counts as provided. This rule
checks that the compiler is *reachable*, not that it is green.

## Fix prompt

> This TypeScript project never runs the compiler, so type errors can ship.
>
> 1. Add a `typecheck` script to `package.json`: `"typecheck": "tsc
>    --noEmit"`. (If the project builds with Vite, `vite build` does not
>    type-check — esbuild strips types without checking them, so this
>    script is the only thing that will.)
> 2. Run it. Fix what it reports, or record what you're deferring — do not
>    make the script pass by loosening `tsconfig.json`.
> 3. Wire it into CI so it runs on every push, and into a pre-push hook or
>    the `build` script so it can't be skipped locally.
> 4. If this is a Next.js project and `next.config.*` sets
>    `typescript: { ignoreBuildErrors: true }`, remove that line. It
>    disables the type check `next build` performs by default, which is
>    almost certainly not what you want outside the first hour of the
>    project.
