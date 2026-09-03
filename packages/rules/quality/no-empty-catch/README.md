# Empty catch block

**Why AI does this:** an assistant wrapping risky code in `try`/`catch` to
satisfy "handle errors" is following the instruction literally — the
syntax is correct, the block compiles, the happy path it was asked to
build still works in the demo. Deciding *what to actually do* when the
catch fires (log it, rethrow it, surface it to the user, retry) is a
judgment call about the surrounding system that isn't answered by "add
error handling," so it's left as a `// TODO` or nothing at all.

**What breaks:** the failure is real, but nothing observes it. A request
silently returns bad or partial data, a write silently doesn't happen, a
background job silently stops — and there's no log line, no metric, no
stack trace, nothing to grep for when a user reports something's wrong.
This is *the* signature AI-generated-code smell precisely because it looks
responsible (there's a try/catch!) while being strictly worse than no
try/catch at all, which would have at least crashed loudly.

**Detection:** `astgrep` tier. Matches a `catch_clause` whose
`statement_block` is empty or contains nothing but comments (line or
block) — RULESET.md treats "empty" and "only a comment" as the same
finding, since a comment doesn't handle anything either. This is
structural, not line-based: formatting doesn't matter (a minified,
single-line `catch(e){}` is caught the same as a nicely indented one —
see `fixtures/bad/src/minified.ts`), and it correctly ignores
commented-out code that merely *looks* like an empty catch inside a `//`
or `/* */` comment (see `fixtures/good/src/commented-out-bad-code.ts`) —
both wins a per-line regex tier can't reliably deliver. Known limit: this
only catches an *empty* handler, not a handler that runs but doesn't
meaningfully do anything (e.g. `catch (e) { return null; }` silently
swallowing the error just as effectively) — that's a judgment call about
intent this tier doesn't attempt to make.

## Fix prompt
> The catch block at {{file}}:{{line}} doesn't do anything with the
> error. Either handle it meaningfully (log it with context, surface it
> to the caller, retry, or show the user something), or rethrow it if
> this layer genuinely has nothing useful to do — don't leave it silent.
