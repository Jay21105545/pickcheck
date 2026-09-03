# onClick on a non-interactive element with no role and tabIndex

**Why AI does this:** a mock shows a clickable card, row, or icon with no
native `<button>` styling constraints attached to it, so the assistant
reaches for the element that already has the right layout properties — a
`<div>` or `<span>` — and attaches `onClick` directly to it. The click
handler works perfectly with a mouse in the browser preview, which is the
only way most of these components ever get tested, so nothing surfaces
the gap.

**What breaks:** a `<div>`/`<span>` isn't in the browser's default tab
order and has no implicit ARIA role, so a keyboard-only user can't reach
it with Tab and a screen reader announces it as plain text, not as
something actionable — the click handler is completely unreachable
without a mouse. This is one of the most common WCAG 2.1.1 (Keyboard)
failures in AI-generated UIs specifically because the visual result looks
indistinguishable from a real button.

**Detection:** `astgrep` tier. Matches a `<div>` or `<span>` JSX element
carrying an `onClick` attribute that does **not** also carry *both* a
`role` and a `tabIndex` attribute — either alone isn't enough: `role`
without `tabIndex` announces the element as a button but still can't be
tabbed to, and `tabIndex` without `role` makes it focusable but silent to
a screen reader. A real `<button>`/`<a>` with `onClick` is never flagged
— only the two elements with no built-in interactive semantics. Known
limit: this checks that `role`/`tabIndex` attributes are *present*, not
that `role` is a sensible value (`role="button"`) or that a matching
`onKeyDown` handler exists so Enter/Space actually trigger the same
action a keyboard user would expect — both are real requirements for full
keyboard accessibility this rule doesn't verify.

## Fix prompt
> The `<div>`/`<span>` at {{file}}:{{line}} has an onClick handler but no
> `role` and `tabIndex` — it's invisible to keyboard and screen-reader
> users. Either switch it to a native `<button>` (simplest, gets
> keyboard/focus/announcement for free), or add `role="button"`,
> `tabIndex={0}`, and an `onKeyDown` handler that triggers the same
> action on Enter/Space.
