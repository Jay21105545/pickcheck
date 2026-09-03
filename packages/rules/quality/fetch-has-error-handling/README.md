# fetch() call with no error handling

**Why AI does this:** `fetch`'s biggest surprise — a 404 or 500 response
does **not** reject the promise — is exactly the kind of detail that's
easy to omit when generating code for the happy path described in a
prompt. The assistant writes `await fetch(url)`, gets back a `Response`
object in the demo run (which succeeded), and moves on; nothing about
"fetch the users" signals that a non-2xx response needs its own check.

**What breaks:** a 404, 500, or network failure is treated as success.
`res.json()` either throws on an HTML error page (an unhandled rejection)
or silently returns whatever garbage the server sent, and the caller has
no way to distinguish "got the data" from "the request quietly failed."

**Detection:** `astgrep` tier, v1 heuristic exactly as staged in
RULESET.md. Matches a `fetch($$$ARGS)` call that is **not**: inside a
`try`/`catch` anywhere up the tree, **or** inside a function that
contains a `.ok` check or a `.catch(` call *anywhere in its body*.

That second condition is deliberately loose — RULESET.md specs it as "no
reference to a validation lib... in the same file" for the sibling
`sec/post-has-validation` rule, and this rule takes the same honestly-a-
heuristic shape: it confirms the *pattern* of error handling exists
somewhere in the enclosing function, not that it's actually applied to
*this* fetch's response. A function with two fetch calls, one correctly
`.ok`-checked and one not, will not flag the unchecked one — the `.ok`
text anywhere in the function satisfies the check for both. Tightening
this to bind the check to the specific response variable needs dataflow
analysis (which variable does `res` alias, is `res.ok` reachable after
*this* call specifically) that a structural pattern match doesn't do.
Flagged this way regardless: a bare `await fetch(...)` with nothing after
it, a `fetch(...).then(...)` chain with no `.catch`, and a fire-and-forget
`fetch(...)` at module scope (no enclosing function to search at all).
Not flagged: `try`/`catch`-wrapped calls, an `.ok` check anywhere in the
enclosing function, a `.catch(...)` chain, and a small wrapper utility
that does the try/catch once for every caller.

## Fix prompt
> The fetch() call at {{file}}:{{line}} has no error handling. Wrap it in
> try/catch, add an `if (!res.ok) { ... }` check before reading the body,
> or add a `.catch(...)` — `fetch` does not reject on 4xx/5xx responses,
> so without one of these a failed request is silently treated as
> success.
