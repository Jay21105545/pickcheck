# input element with no associated label

**Why AI does this:** a visual mock or a prompt like "add a search box"
specifies a placeholder and maybe a border, and the assistant renders
exactly that — `<input type="text" placeholder="Search" />` looks
complete on screen, since a placeholder reads like a label to sighted
eyes. Nothing about the visual result signals that a placeholder isn't an
accessible name: it disappears on focus and isn't reliably exposed to
assistive technology at all.

**What breaks:** a screen reader user tabbing to the field hears "edit
text, blank" with no indication of what to type — the field's *purpose*
exists only as a visual placeholder that assistive tech doesn't announce
as a label. This also fails automated accessibility audits and makes the
form unusable by voice-control software (which needs an accessible name
to target the field by).

**Detection:** `astgrep` tier. Matches an `<input>` element with none of:
an `aria-label`, an `aria-labelledby`, an `id` (see limit below), a
`type="hidden"`/`"submit"`/`"button"` (these don't need a text label —
they're invisible or self-labeling), or a wrapping `<label>` ancestor
element (`<label>Name <input /></label>`).

Known limit, the honest kind this rule leans on to stay conservative:
`id` alone suppresses the finding, even though an `id` doesn't *prove* a
`<label htmlFor="...">` actually references it elsewhere — verifying that
requires matching one element's attribute value against a different
element's, anywhere in the tree, which structural pattern matching
doesn't do. Treating a present `id` as "probably paired with a label" is
a deliberate false-negative-favoring choice: the alternative (flagging
every `id`-only input) would swamp real projects that *do* pair inputs
with labels via `htmlFor` in false positives. Also out of scope: a
`<label>` wrapping the input through more than one level of JSX
indirection (e.g. a shared `<Field>` wrapper component that renders the
label around its children) isn't recognized as association — this rule
only sees the wrapper actually present in the same file's JSX tree.

## Fix prompt
> The `<input>` at {{file}}:{{line}} has no accessible name — no
> `aria-label`, no `aria-labelledby`, no associated `<label>`. Add a
> visible `<label htmlFor="...">` paired with a matching `id`, or an
> `aria-label` if a visible label doesn't fit the design.
