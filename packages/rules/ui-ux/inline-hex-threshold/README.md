# Many inline hex colors in one file

**Why AI does this:** each component is generated in isolation, and
without an existing theme file to reference, the fastest way to make a
design look right *right now* is to type the hex value straight into the
JSX or CSS — `color: "#3b82f6"` needs no import, no lookup, no context
about what token system (if any) the rest of the app uses. Multiply that
across many components generated in separate sessions and a codebase ends
up with dozens of near-identical blues, each spelled out independently,
with no single place to change "the brand blue" later.

**What breaks:** this isn't a runtime bug — the colors render fine — but
it's real, compounding maintenance cost. A rebrand or a dark-mode pass
means grepping for hex strings and hoping you found them all; two
components meant to share a color drift apart by a shade over time with
no build-time signal; and there's no single source of truth a designer or
another AI session can hand off a theme change to.

**Detection:** `regex` tier with a per-file occurrence threshold
(`pattern.minCount`, DECISIONS/0011): counts every `#`-prefixed hex color
literal (3–8 hex digits, covering `#fff`, `#3b82f6`, and 8-digit
`#3b82f6ff` with alpha) across the whole file, and fires once that count
reaches 5 — a single one-off hex color is completely normal and not
flagged; the volume within one file is the actual signal. Deliberately
conservative: this can't tell a real design-token drift problem from a
file that's *supposed* to define a palette (a theme/tokens module) —
exclude those paths from `files` (or raise the threshold) if this rule
fires there. It also can't see whether the hex values are actually
distinct colors or the same one repeated many times, verbatim CSS custom
property fallbacks, or already centrally defined and merely re-exported
here — it purely counts occurrences of the pattern.

## Fix prompt
> {{file}} has several inline hex colors instead of shared design tokens.
> Extract them into a central theme/tokens file (CSS custom properties,
> a Tailwind config, or a JS/TS constants module — whatever this project
> already uses elsewhere) and reference them by name here instead of
> repeating the raw hex values.
