# img element missing an alt attribute

**Why AI does this:** a prompt describing a layout ("add the user's
avatar next to their name") specifies *what* image goes where, not what a
screen reader should say about it — and the assistant has no way to infer
meaningful alt text on its own, since it doesn't know why the image is
there or what it would mean to lose it. Rather than guess, it often just
omits `alt` entirely and moves on to the next visible requirement, since
the rendered page looks identical either way.

**What breaks:** a screen reader announces an `<img>` with no `alt` by
its filename ("photo dash 2 dash final dot j p g") or, in some
configurations, skips it silently — either way, a user relying on
assistive technology gets no information about the image at all. It also
fails automated accessibility audits (axe, Lighthouse) and, for an image
that conveys real information (a chart, an icon-only button, a QR code),
means that information simply doesn't exist for a meaningful fraction of
users.

**Detection:** `astgrep` tier. Matches a JSX `<img>` element (self-
closing or with a closing tag) that has no `alt` attribute at all. Two
cases are deliberately excluded to keep this conservative: an `alt=""`
(explicitly empty) *does* count as present — that's the correct, deliberate
way to mark a purely decorative image, not a violation — and an element
spreading props (`<img {...props} />`) is skipped entirely, since `alt`
may well be inside the spread object and a structural pattern can't see
through it. Only the literal lowercase `<img>` host element is checked —
a wrapped component like Next.js's `<Image>` isn't, since it's a
different tag name entirely and may have its own alt-handling
conventions. Known limit: this proves `alt` is *present*, not that its
text is meaningful (`alt="image"` or `alt="IMG_2043"` both pass) — that's
a judgment call about content this tier doesn't attempt to make.

## Fix prompt
> The `<img>` at {{file}}:{{line}} has no `alt` attribute. Add one
> describing what the image conveys (or `alt=""` if it's purely
> decorative and adds no information) so screen reader users aren't left
> with a filename or silence in its place.
