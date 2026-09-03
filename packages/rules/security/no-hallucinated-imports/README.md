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

**Detection:** `manifest` tier, `pattern.mode: hallucinated-import` (see
[ADR 0007](../../../../DECISIONS/0007-manifest-tier.md), recalibrated in
[ADR 0015](../../../../DECISIONS/0015-manifest-tier-false-positive-fixes.md);
the tier gained a second mode, `requires-dependency`, in
[ADR 0018](../../../../DECISIONS/0018-raw-card-input-no-payment-sdk.md) —
both modes share the same ancestor-union dependency resolution described
below, just to answer a different question).
`pattern.regex` extracts the quoted specifier from `import ... from '...'`
(including `import type`), bare `import '...'`, `require('...')`, and
dynamic `import('...')` — one line at a time, same mechanics as the regex
tier, but run against the file's content with every `//` and `/* ... */`
comment already blanked out (see "Comment stripping" below). The engine
then resolves that specifier to the package name that would need to
appear somewhere across **every ancestor** `package.json` from the file
being checked up to the scanned root — `dependencies` / `devDependencies`
/ `peerDependencies` / `optionalDependencies`, unioned at each level — the
same "walk every ancestor `node_modules`" resolution Node's own module
system uses, not a single fixed manifest anywhere. This matters in any
workspace/monorepo (pickcheck's own repo included — `packages/cli`,
`packages/rules`, …): each package's own dependencies live in its own
`package.json`, but its *tooling config* commonly relies on a
devDependency declared at the workspace root instead of repeating it in
every package (e.g. `packages/cli/tsup.config.ts` importing `tsup`, which
lives only in the root `package.json`) — and that's a real, resolvable
import, not a hallucinated one. A scoped subpath like
`@pickcheck/rules/schema` resolves to `@pickcheck/rules`; an unscoped
subpath like `lodash/debounce` resolves to `lodash`. A package declared
via the workspace protocol (`"@pickcheck/rules": "workspace:^"`) is still
just a key in `dependencies`, so it's already treated as declared with no
special casing needed.

**Never flagged, regardless of `package.json` (four independent exemptions):**
1. Node builtins (`fs`, `node:fs`, `fs/promises`, …, read from
   `node:module`'s `builtinModules`).
2. Relative imports (`./x`, `../x`) and `@/`-style local path aliases
   (Next.js/tsconfig `paths` — `@` immediately followed by `/` has no
   scope name, so it can't be a real npm scope either).
3. **Scheme-prefixed specifiers** — `https://…`/`http://…` (Deno/Supabase-
   Edge-Function URL imports, resolved by the Deno runtime, not
   `package.json`), and Deno's own `npm:`/`jsr:` registry schemes. Added in
   ADR 0015 after real-world review found Lovable-generated Supabase Edge
   Functions (`supabase/functions/*/index.ts`) universally use
   `import { serve } from "https://deno.land/std@.../http/server.ts"` —
   flagged as an undeclared package named literally `"https:"` before this
   fix.
4. **A bare specifier that resolves to a real local file or directory** —
   checked against the nearest ancestor `tsconfig.json`/`jsconfig.json`'s
   `compilerOptions.baseUrl` (falling back to the scanned repo root if none
   declares one, which also covers bundler root-relative resolution with no
   tsconfig in the picture at all). Added in ADR 0015: this was the
   dominant false-positive source in real-world review — projects that use
   bare local imports instead of (or alongside) `@/` aliases, e.g.
   `import { Carousel } from "components/carousel"` (vercel/commerce,
   `baseUrl: "."`, no `paths` at all) or `import { X } from "types"`
   (shadcn-ui/taxonomy, resolving to `./types/index.d.ts`) — both real,
   resolvable local modules that were being read as hallucinated npm
   packages named `"components"` and `"types"`.

**Comment stripping (closes the former TODO below):** specifier extraction
now runs against the file's content with every `//` line comment and
`/* ... */` block comment (including JSDoc type annotations like
`/** @type {import('pkg')} */`) replaced with blank space before the regex
ever sees it — a character-scan that tracks whether it's inside a string
literal (so `"https://deno.land/..."` is left alone; the `//` is inside an
open string, never treated as a comment start) or inside a comment (so a
quote character inside a comment never opens a fake string). This isn't a
real parser and doesn't handle every edge case (nested template-literal
expressions, regex literals containing `//`), but it closes the two real
false-positive shapes found in real-world review: a **commented-out**
import naming a nonexistent package — `// import { x } from
"definitely-not-a-real-package";` — and, more surprisingly, ordinary
**English prose in a comment** that happens to contain `from "quoted
text"` (`// switching away from "Other"`, read as `import ... from
"Other"`) or a JSDoc type reference to a real-but-undeclared package
(`/** @type {import('postcss-load-config').Config} */`, found verbatim in
vercel/commerce's `postcss.config.mjs`). Two false positives in
pickcheck's own repo (the original motivation for the TODO this replaces)
plus these two in real-world review made stripping comments worth doing
now rather than waiting on the `astgrep`-tier v1.1 rewrite described
below — that rewrite is still the more structurally correct fix (it would
also handle the edge cases this character-scan doesn't) and remains the
recommended next step if any of those edge cases turn up real findings.

## Fix prompt
> The import at {{file}}:{{line}} references a package that isn't in this
> project's package.json. Verify whether the package actually exists on
> npm under that exact name — if it does, add it as a dependency; if it
> doesn't, find the real package name (or write the missing piece
> yourself) rather than installing whatever `npm install` on that literal
> string turns up.
