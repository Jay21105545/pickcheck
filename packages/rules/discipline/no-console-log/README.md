# console.log left in source

**Why AI does this:** `console.log` is how an assistant debugs its own
generated code mid-session — it adds a print statement, runs the code,
reads the output, confirms the fix worked. The debugging step is
disciplined; removing the print statement afterward is a separate step
that nothing in "make this work" prompts for, so it ships.

**What breaks:** nothing functionally, which is exactly why it survives
review — but a production server printing arbitrary debug output pollutes
logs, can leak request/response bodies containing user data, and drowns
out the log lines that actually matter during an incident.

**Detection:** `astgrep` tier, matching `console.log($$$ARGS)` structurally
— exactly as RULESET.md specs it. Excludes tests, `scripts/`, and
`*.config.*` files, where a stray print statement is expected and
harmless, plus (via `excludePackageScriptTargets` — DECISIONS/0017) any
file that's the direct execution target of a `package.json` `scripts`
entry (`"db:setup": "npx tsx lib/db/setup.ts"` exempts `lib/db/setup.ts`),
regardless of which directory it lives in. That third exclusion exists
because `!**/scripts/**` only catches a script by *directory* convention;
real-world review of nextjs/saas-starter found the equally common Drizzle/
Prisma-ecosystem convention of a `db:setup`/`db:seed` script living under
`lib/db/` or `db/` instead — a one-off interactive CLI script (`readline`
prompts, a self-invoking `seed().catch().finally()` at module scope) whose
entire purpose is printing progress to a developer's terminal, not
"debug output left in production code." 31 of saas-starter's 36
`disc/no-console-log` findings were this exact shape. This rule shipped
as a `regex` tier in an earlier phase (see
[ADR 0005](../../../../DECISIONS/0005-conditional-exists-precondition.md),
written back when `tiers/astgrep.ts` was still a stub) matching the
literal text `console.log(` per line; now that the astgrep tier is
implemented, it's upgraded to the tier RULESET.md always specified. Two
concrete wins from the upgrade, both covered by fixtures: a call broken
across multiple lines (`console\n  .log(...)`, `fixtures/bad/src/
multiline.ts`) now matches — a per-line regex physically can't see a call
whose `console` and `.log(` tokens are on different lines — and a
`console.log(...)` sitting inside a `//` or `/* */` comment
(`fixtures/good/src/commented-out.ts`) is correctly ignored, since ast-grep
matches real syntax nodes, not text that merely looks like a call.
Formatting is irrelevant either way: a minified, whitespace-free call
(`fixtures/bad/src/minified.js`) matches identically to a nicely spaced
one.

**Known limit, unchanged by the upgrade:** a call reached through an alias
— `const log = console.log; log(x)` — still isn't caught. The pattern
matches the literal AST shape `console.log(...)`; once the reference is
reassigned to a plain identifier, that shape is gone. Catching this would
mean tracking variable bindings back to their origin (real dataflow
analysis), not structural pattern matching — genuinely out of scope for
this tier, not an oversight.

## Fix prompt
> Remove the `console.log` call at {{file}}:{{line}}, or replace it with
> your app's real logger (e.g. `logger.debug(...)`) if the output is
> actually useful in production.
