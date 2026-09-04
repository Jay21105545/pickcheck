# ADR 0025 — Gate the bin entry on the Node floor, and load the CLI dynamically so the gate can run

**Status:** accepted · **Date:** 2026-09-04

**Implements** the "friendly runtime version check in the bin entry"
that [ADR 0024](0024-node-floor-22.md) named and deliberately deferred.

## Context

ADR 0024 raised `engines.node` to `>=22.12.0` — `commander@15`'s own
floor — and measured what that does and does not fix. What it does not
fix: `engines` is **advisory**. npm enforces it only when the user has
`engine-strict` set, so `npm i -g pickcheck` on Node 20 prints warnings
and then succeeds. The tool is installed, unsupported, and gives no
indication of it until something inside a dependency fails, at whatever
moment that dependency first reaches syntax or an API the runtime lacks.
0024 closed with: "A friendly runtime version check in the bin entry
would turn that into a clear message and is worth considering, but is
deliberately out of scope here."

Measured today, `commander@15` actually *does* load on Node 20 — it
declares the floor without yet depending on anything exclusive to it. So
this is a latent hazard rather than a live crash. That makes it more
worth fixing, not less: the failure it produces when it does arrive will
be a stack trace from inside someone else's package, at an arbitrary
point in the run, naming neither the required version nor the actual one.

## Options

1. **Do nothing** — rely on `engines` and the EBADENGINE warnings.
   Rejected: advisory, easy to scroll past, and silent afterwards.
2. **Check the version inside `audit`/`init`/`gen`** — after commander
   has parsed argv. Rejected: commander is exactly what may fail to load.
3. **Check at the top of the bin entry, with the CLI statically
   imported.** Rejected, and this is the crux — see below.
4. **Check at the top of the bin entry, with the CLI behind
   `await import()`.** Chosen.

## Decision

`src/index.ts` becomes the gate and nothing else. The CLI moves to
`src/cli.ts`, reached by `await import("./cli.js")` only once the check
passes.

**Option 3 does not work, and the reason is a language rule rather than a
preference.** ES module static imports are hoisted: every statically
imported module is fully resolved and evaluated *before any statement in
the importing module runs*. A static `import { Command } from
"commander"` above the check would therefore load commander on exactly
the runtimes the check exists to reject, before the check could print a
word. Verified directly:

```
$ cat static.mjs           $ cat dynamic.mjs
import "./dep.mjs";        console.log("gate ran first");
console.log("gate here");  await import("./dep.mjs");

$ node static.mjs          $ node dynamic.mjs
Error: dependency evaluated ← gate ran first
                             Error: dependency evaluated
```

The static form never reaches its own first statement. So the dynamic
import is not a startup optimisation and is not optional: it *is* the
feature. Inlining `cli.ts` back into `index.ts` would silently disable
the gate while leaving every unit test green, which is why
`test/preflight.test.ts` asserts the structure — in source and in the
built bundle — alongside the behaviour.

The same reasoning constrains `index.ts` and `preflight.ts` to `node:`
builtins old enough to predate the floor: this code has to *run* on the
runtimes it rejects.

### The floor is read, not hardcoded

`preflight.ts` reads `engines.node` out of the package's own manifest at
startup. ADR 0024 already spreads the floor across six files and warned
that a partial update recreates the contradiction it fixed; a seventh
copy, one that could disagree with the manifest npm itself enforces, is
the last thing this needs. The manifest is read on every startup already
(`getVersion()`), and it is ~1.5KB.

If the floor can't be established — `engines` absent, not a string, no
numeric bound — the gate stays out of the way. A gate that cannot tell
what it is enforcing must let the user through: blocking on a guess turns
a packaging slip into an unrunnable CLI, which is strictly worse than the
advisory behaviour this backstops.

### The message

```
pickcheck requires Node.js >=22.12.0, but this is Node.js v20.11.1.
Upgrade Node.js (https://nodejs.org) and run pickcheck again.
```

Both versions, named, on the first line — the thing a stack trace from
inside a dependency cannot give you. Written to stderr, with
`process.exitCode = 1` rather than `process.exit(1)`, which can truncate
an unflushed pipe write; the message is the entire point of the branch.

Verified against real runtimes rather than mocks: Node 18.20.7 and
20.11.1 both print it and exit 1; Node 22.22.0 runs normally.

## Consequences

- **The startup budget guard had to change shape.** Moving the CLI behind
  a dynamic import moves the whole command layer out of the entry's
  static graph, which would have made
  `publishable-package.test.ts`'s byte tripwire (ADR 0022) pass
  vacuously — it walked static imports only. It now follows the entry's
  one bootstrap `import()` as if it were static, since that chunk loads
  on every invocation, and asserts the walk still reaches more than two
  chunks so it can't quietly measure an empty entry. Measured after the
  change: 74.5KB across 3 chunks against the 150KB tripwire, and
  `measure-startup` reports 42.0ms against the 50ms budget — unchanged
  from the 41.6ms ADR 0022 recorded.
- One extra `readFileSync` of a small JSON file per invocation.
- A compound range (`"^20 || >=22"`) is read as its first bound. The
  gate can therefore only ever be laxer than intended, never stricter,
  which is the right direction for a backstop. Our own range is a plain
  `>=`.
- This does not silence EBADENGINE at install time — those come from the
  dependencies' own `engines` and nothing we declare can suppress them
  (ADR 0024). It changes what happens *after* the install: a clear
  refusal instead of an eventual stack trace.
