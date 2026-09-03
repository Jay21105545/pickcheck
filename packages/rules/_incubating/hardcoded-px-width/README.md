# Hardcoded large pixel width (responsive smell)

> **Status: incubating, not shipped.** Parked in `_incubating/` —
> excluded from rule loading (`loadRules()` ignores `**/_incubating/**`)
> and from the shipped ruleset, per
> [DECISIONS/0014](../../../../DECISIONS/0014-ruleset-calibration.md).
> A 4-repo real-world calibration run measured this rule at **18%
> precision** (3 true positives out of 19 findings) — see that record for
> the full methodology and results. This README's original body below is
> left as written; the section immediately after this notice documents
> what calibration actually found, as groundwork for whoever resumes this
> rule.

## Calibration findings (why this is parked)

Three distinct, compounding bugs in the regex — all mechanical, not
judgment calls — accounted for the overwhelming majority of false
positives:

1. **`min-width:`/`max-width:` matched as `width:`.** The regex has no
   word boundary before `width`, so it matches *inside* `min-width` and
   `max-width`. This is catastrophic against Next.js's
   `<Image sizes="(min-width: 1024px) 20vw, ...">` — a *correct*,
   idiomatic responsive-image hint, flagged as its exact opposite. This
   single bug caused 7 of the 19 real-world findings (all in
   `vercel/commerce`). Notably, the original README above already
   *claimed* `min-width`/`max-width` weren't detected — the
   implementation didn't match its own documented intent, which the
   fixture suite never caught because no fixture happened to exercise a
   `sizes` attribute or a real `max-width` declaration.
2. **`max-w-[Npx]` matched as `w-[Npx]`.** Same missing-boundary class of
   bug, Tailwind-utility flavor: `max-w-[420px]` contains the substring
   `w-[420px]`, which the regex happily matches even though `max-width`
   is the textbook *correct* responsive pattern (an upper bound that
   still shrinks below it). 4 of 19 findings.
3. **Tailwind breakpoint variants ignored.** `sm:w-[350px]` and
   `md:w-[390px]` — "full width on mobile, fixed above the breakpoint,"
   the *recommended* Tailwind idiom for exactly the problem this rule
   is trying to catch — were flagged as if bare. 4 of 19 findings
   (including one case where the element was additionally `hidden`
   below its breakpoint, so had zero mobile footprint at all).

Genuine true positives (3 of 19): two matching `w-[800px]` fixed-width
containers with no responsive fallback at all (a prose editor and its
loading skeleton, in `shadcn-ui/taxonomy`), and one `w-[400px]` form
input with no responsive wrapper.

**Why pull rather than patch:** fixing all three known bugs (a word-
boundary anchor excluding `min-`/`max-` prefixes, an explicit `max-w-`
exclusion, and a negative-lookbehind for breakpoint-variant prefixes)
still leaves a **regex tier** structurally unable to reason about
Tailwind's variant system as a first-class concept — real residual false
positives on patterns this one sample didn't happen to exercise (`grid-
template-columns` values, arbitrary non-width utilities containing
`width` as a substring, container queries, etc.) are the expected
outcome, not an edge case. At >80% wrong, this had crossed from
"occasionally noisy, net useful" into "usually wrong, actively
misleading" — CLAUDE.md's "ship as warn with honest README limits" isn't
sufficient once the failure *rate* itself is the problem, not just a
documented edge case.

**Recommended next step:** rewrite as an `astgrep`-tier rule. Structural
matching can distinguish a bare `w-[Npx]` JSX attribute value from one
prefixed by a Tailwind variant (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`) or by
`max-`, and can target the CSS `width` *property* specifically rather
than any text containing the substring `width:` — the same class of fix
`ux/img-missing-alt`/`ux/input-missing-label` already apply via
structural spread-prop and attribute-name checks, not regex substring
matching.

---

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
