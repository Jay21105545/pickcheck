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

**Detection:** regex tier, matching `console.log(` in application source
(`.ts`/`.tsx`/`.js`/`.jsx`), excluding tests, `scripts/`, and
`*.config.*` files, where a stray print statement is expected and
harmless. RULESET.md specs this rule as `astgrep` tier (matching
`console.log($$$)` structurally, i.e. any call regardless of formatting).
The astgrep tier isn't implemented yet (`packages/cli/src/engine/tiers/
astgrep.ts` is a stub — see DECISIONS/0005), so this ships as a regex
match on the literal `console.log(` call-open instead. Known limit
inherited from the tier, not the pattern: it's a per-line regex, so it
won't catch a call broken across multiple lines
(`console\n  .log(...)`) or one going through an alias
(`const log = console.log; log(...)`) the way a structural astgrep match
would. It also can't distinguish a real call from one inside a
same-line comment.

## Fix prompt
> Remove the `console.log` call at {{file}}:{{line}}, or replace it with
> your app's real logger (e.g. `logger.debug(...)`) if the output is
> actually useful in production.
