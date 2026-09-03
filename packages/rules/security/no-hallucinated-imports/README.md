# Import of a package absent from package.json

**Why AI does this:** an assistant generating code from its training
distribution reaches for the package name that *statistically* goes with
the task — `fetch-retry-pro`, `date-fns-tz-lite`, whatever a real package
in that space is usually called — without checking whether that exact
package exists or is actually installed in this repo. Most of the time it
guesses right; the rest of the time it produces a plausible-sounding name
that was never published, or one that was never added to `package.json`
even though it exists.

**What breaks:** the build fails at the first `import` of the missing
package. Worse, a plausible hallucinated name is a **slopsquatting**
target — an attacker who registers the exact string an LLM tends to
hallucinate gets installed the moment a human (or an agent with install
permissions) tries to "fix" the missing dependency by running `npm
install <the hallucinated name>`.

**Detection:** `manifest` tier (see [ADR 0007](../../../../DECISIONS/0007-manifest-tier.md)).
`pattern.regex` extracts the quoted specifier from `import ... from '...'`
(including `import type`), bare `import '...'`, `require('...')`, and
dynamic `import('...')` — one line at a time, same mechanics as the regex
tier. The engine then resolves that specifier to the package name that
would need to appear somewhere across **every ancestor** `package.json`
from the file being checked up to the scanned root — `dependencies` /
`devDependencies` / `peerDependencies` / `optionalDependencies`, unioned
at each level — the same "walk every ancestor `node_modules`" resolution
Node's own module system uses, not a single fixed manifest anywhere. This
matters in any workspace/monorepo (pickcheck's own repo included —
`packages/cli`, `packages/rules`, …): each package's own dependencies
live in its own `package.json`, but its *tooling config* commonly relies
on a devDependency declared at the workspace root instead of repeating it
in every package (e.g. `packages/cli/tsup.config.ts` importing `tsup`,
which lives only in the root `package.json`) — and that's a real,
resolvable import, not a hallucinated one.
a scoped subpath like `@pickcheck/rules/schema` resolves to
`@pickcheck/rules`; an unscoped subpath like `lodash/debounce` resolves to
`lodash`. Three things are never flagged, regardless of `package.json`:
Node builtins (`fs`, `node:fs`, `fs/promises`, …, read from
`node:module`'s `builtinModules`), relative imports (`./x`, `../x`), and
`@/`-style local path aliases (Next.js/tsconfig `paths` — `@` immediately
followed by `/` has no scope name, so it can't be a real npm scope
either). A package declared via the workspace protocol
(`"@pickcheck/rules": "workspace:^"`) is still just a key in
`dependencies`, so it's already treated as declared with no special
casing needed.

**Known limit (regex extraction, not the manifest cross-reference):** the
specifier extraction is per-line and has no concept of comments, same
limit `disc/no-console-log`'s README documents for its own pattern. A
**commented-out** import naming a nonexistent package —
`// import { x } from "definitely-not-a-real-package";` — is still
extracted and will be flagged as if it were live code. This is a
deliberate false positive over a silent miss: the regex tier provably
can't distinguish "inside a `//` comment" from "live code" without a real
parser, and pretending otherwise by special-casing comment stripping here
would just move the false-negative risk to `/* ... */` block comments,
JSX comments, and every other comment shape instead of removing it. If
this proves noisy in practice, the fix is an `astgrep`-tier v1.1 (matching
`import_statement`/`call_expression` nodes structurally, the same
upgrade path `disc/no-console-log` already took) — not a regex patch.

**TODO (phase-1.1):** this has stopped being hypothetical — comment-blind
extraction has now caused two false positives in pickcheck's own repo.
The real fix is stripping comments before specifier extraction (the
`astgrep`-tier rewrite above), not rewording the prose that happens to
trip the regex.

## Fix prompt
> The import at {{file}}:{{line}} references a package that isn't in this
> project's package.json. Verify whether the package actually exists on
> npm under that exact name — if it does, add it as a dependency; if it
> doesn't, find the real package name (or write the missing piece
> yourself) rather than installing whatever `npm install` on that literal
> string turns up.
