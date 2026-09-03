# Hardcoded large pixel width (responsive smell)

**Why AI does this:** a design mock or a screenshot has exact pixel
dimensions, and the most literal translation of "make it look like this"
is to copy those pixels directly into `width: 480px` or `w-[480px]` —
it matches the reference image pixel-for-pixel on the viewport the mock
was drawn at, which is usually the only viewport anyone checks before
calling the component done.

**What breaks:** a fixed large width doesn't shrink on a narrower
viewport — a `480px` panel on a 375px-wide phone screen either overflows
horizontally (introducing an unwanted scrollbar or clipped content) or
forces the whole layout wider than the device. Relative units
(`max-width` + `width: 100%`, a `%`, a fluid `clamp()`, or a
breakpoint-aware Tailwind class) adapt; a bare large pixel value doesn't,
by definition.

**Detection:** `regex` tier. Flags `width: 300px`-style declarations (CSS,
or a React inline `style` object) and Tailwind arbitrary-value classes
(`w-[600px]`) where the pixel value is **200 or greater** — small pixel
widths (an icon, an avatar, a border, a fixed-size badge) are extremely
common and almost never a responsive-layout concern, so this rule only
looks at values large enough to plausibly be a container, panel, or
card. That floor is a blunt but deliberate false-positive guard: it
can't tell a 400px modal that's *intentionally* fixed-width by design
from a genuine "this should have been responsive" mistake — both look
identical to a regex. Also not detected: `min-width`/`max-width` (a
`max-width` alongside a percentage `width` is usually the *correct*
responsive pattern, not a smell), and pixel values expressed as a
computed template string or a JS variable rather than a literal.

## Fix prompt
> The width at {{file}}:{{line}} is hardcoded to a large fixed pixel
> value. If this needs to adapt to narrower viewports, replace it with a
> relative unit (`width: 100%` plus `max-width` for an upper bound, a
> `%`, or a responsive Tailwind class) — if the fixed size is genuinely
> intentional here, leave it, but confirm it degrades acceptably on a
> narrow screen.
