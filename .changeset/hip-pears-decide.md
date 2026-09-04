---
"pickcheck": patch
---

Refuse to run on an unsupported Node with a message that names both
versions, instead of failing later from inside a dependency.

`engines` is advisory — npm only enforces it under `engine-strict` — so
installing on a Node below the `>=22.12.0` floor succeeds and stays
silent until something breaks somewhere unhelpful. The bin entry now
checks the runtime against that declared floor first and exits 1 with
`pickcheck requires Node.js >=22.12.0, but this is Node.js v20.11.1.`

The CLI moved to `src/cli.ts` behind a dynamic import so the check can
actually run: static imports are hoisted and evaluated before any of the
importing module's own statements, so a statically imported commander
would load on precisely the runtimes the check exists to catch. See
DECISIONS/0025.
