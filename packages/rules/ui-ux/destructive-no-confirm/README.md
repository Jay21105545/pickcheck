# Destructive action with no confirmation step

**Why AI does this:** "add a delete button" is usually read as a request
to wire up the delete *endpoint*, not to design the interaction around
the fact that deletion is irreversible — the assistant connects the
button's `onClick` straight to the DELETE call, tests it once against
data it doesn't mind losing, and the feature is "done" because the item
disappears exactly as asked.

**What breaks:** a misclick, a double-tap on mobile, or a user who didn't
realize what a button did permanently destroys data with no recovery
path — no undo, no trash, no second chance. Destructive actions are one
of the few places where a slower, more deliberate interaction is
*correct* UX, not friction to be optimized away, and it's exactly the
kind of judgment call ("this needs to be harder to trigger by accident")
that isn't visible from "add a delete button" alone.

**Detection:** `regex` tier. Flags a call shaped like `axios.delete(` or a
`fetch`/request options object with `method: "DELETE"` in a component
file, **unless** the same file also references a confirmation mechanism
anywhere — `confirm`, `window.confirm`, `useConfirm`, `ConfirmDialog`,
`AlertDialog`, `areYouSure`, `isConfirmOpen` (case-insensitive). Deliberately
scoped to the DELETE HTTP verb specifically, not to function names like
`delete`/`remove`/`destroy` — a name-based heuristic would flag things
like `deleteFromCache` (a harmless local operation) constantly; actually
calling a DELETE endpoint is a much stronger, lower-false-positive signal
that something irreversible is happening. Known limits: a confirmation
step that lives in a *different* file (a shared `<DeleteButton>` wrapper
component elsewhere in the codebase that already handles confirmation) is
invisible to this file-scoped check and will be flagged anyway; and a
destructive action expressed a different way — a GraphQL mutation, a
server action, a `DELETE` sent via a request library this rule doesn't
recognize — won't be caught at all. Ship this as a warn and read its
findings with that in mind.

## Fix prompt
> The delete action at {{file}}:{{line}} has no confirmation step before
> it runs. Add a confirmation — a native `window.confirm(...)` at minimum,
> or a proper confirmation dialog component — so a single accidental
> click can't permanently destroy data.
