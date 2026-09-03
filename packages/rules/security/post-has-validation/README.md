# Request body read with no apparent validation

**Why AI does this:** an assistant building a route handler from a prompt
like "add an endpoint that saves an order" produces the shape that makes
the demo work: read the body, use it. Validating that the body actually
has the fields the rest of the code assumes is a defensive step that
"make this endpoint" doesn't ask for, and the happy-path request used to
test it during generation naturally has a well-formed body.

**What breaks:** an unvalidated `req.body` is attacker-controlled input
flowing straight into business logic — missing fields cause runtime
crashes, wrong types cause silent data corruption, and unexpected extra
fields can enable mass-assignment-style vulnerabilities depending on what
the code does with the object next.

**Detection:** `regex` tier, v1 as staged in RULESET.md (the ruleset's
own path to a real fix is "regex v1 → astgrep v1.1" — this ships v1
honestly, not as a finished check). Flags a line matching `req.body` or
`await request.json()` in a file under a detected API-surface path
(`app/api/**`, `pages/api/**`, `routes/**`, `src/routes/**`, `api/**`),
**unless** the file also contains the word `zod`, `yup`, `joi`, `valibot`,
or `class-validator` anywhere (see
[ADR 0008](../../../../DECISIONS/0008-regex-unless-precondition.md) for
the whole-file `pattern.unless` mechanism this relies on). Severity is
`warn`, and the message says "no validation **detected**" deliberately —
this is a heuristic, not a proof of absence.

**Honest limits, by design, not by oversight:**
- **Proximity, not binding.** It confirms a validation library is
  referenced *somewhere in the file*, not that it's actually applied to
  the specific body being read. A file with one validated route and one
  unvalidated route next to it will not flag the unvalidated one — same
  shape of imprecision `qual/fetch-has-error-handling`'s README documents
  for its own "somewhere in the enclosing function" heuristic. Binding the
  check to the specific handler needs a real parser (the astgrep v1.1
  RULESET.md already anticipates), not a smarter regex.
- **Same-file only.** Validation performed in a different file — shared
  middleware, a separate schema module imported and called elsewhere —
  isn't visible to a per-file check and will be flagged as if it didn't
  exist. A real false positive, not a hypothetical one.
- **Only these five libraries.** A hand-rolled validator, a different
  library, or manual `if` checks on the body's shape all count as "no
  validation detected" even though real validation may be happening.
  Narrow on purpose — an unbounded "looks like a check" pattern would
  false-negative on far more than it catches.
- **Comment-blind, like every regex-tier rule in this ruleset.** A
  `req.body` reference inside a `//` comment with no real validated
  handler elsewhere in the file is indistinguishable from a live,
  unvalidated read and will be flagged — the regex tier provably can't
  tell "live code" from "comment" without a real parser. Not faked here
  with a fixture that pretends otherwise; this is the honest limit RULESET.md
  asks this rule to admit rather than paper over.

## Fix prompt
> The request body read at {{file}}:{{line}} has no apparent validation
> in this file. Define a schema (zod, yup, joi, valibot, or
> class-validator — whichever this project already uses elsewhere) for
> the expected shape and parse the body through it before using it, so a
> malformed or malicious request fails with a clear 400 instead of
> reaching business logic.
