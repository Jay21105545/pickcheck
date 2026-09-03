# Submit button with no pending/disabled state

**Why AI does this:** the prompt asks for a working submit button, and
`<button type="submit">Sign up</button>` wired to an `onSubmit` handler
*is* a working submit button — the demo click submits the form exactly
once, because the person testing it clicks once and waits. Nothing about
"add a submit button" specifies what should happen to the button while
the request it triggers is still in flight, so that state simply isn't
built.

**What breaks:** on a real network (or a slow backend), the button stays
clickable for the entire round trip. A user who doesn't see instant
feedback does what people do — clicks again, sometimes several times —
and each click fires another submission: duplicate orders, duplicate
signups, duplicate form submissions hitting a backend that has no
idempotency guard of its own. Even when duplicate submission is harmless,
the lack of any pending indicator reads as "did this work?" and erodes
trust in the interaction.

**Detection:** `astgrep` tier. Matches a `<button type="submit">` with no
`disabled` attribute at all. A `disabled={pending}`-style attribute
(bound to state, the intended fix) suppresses it — the check only cares
that the attribute exists, not that it's correctly wired to an in-flight
flag, since verifying *that* would need dataflow analysis this tier
doesn't do. Known limits: a `<button>` with no explicit `type` attribute
is implicitly `type="submit"` inside a `<form>` per the HTML spec, but
this rule doesn't try to resolve that — it only fires on an *explicit*
`type="submit"`, so an implicit-submit button is a false negative, not a
false positive. Likewise, a submit `<input type="submit">` (rather than a
`<button>`) isn't checked.

## Fix prompt
> The submit button at {{file}}:{{line}} has no disabled/pending state.
> Track an `isSubmitting` (or equivalent) flag, set it while the
> submission request is in flight, and pass it as `disabled={isSubmitting}`
> so the button can't be clicked again until the first request resolves.
