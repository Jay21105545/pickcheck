# pickcheck — DESIGN

One identity across three surfaces: terminal output, HTML report, docs site.
If a screenshot of any surface couldn't be identified as pickcheck, the
design has failed.

## Direction

Surgical, near-monochrome, one sharp accent. Not another purple-gradient AI
site. The product judges other people's polish — it must feel obsessively
polished itself.

- **Base:** near-black `#0A0A0B`, panel `#141416`, borders `#26262A`
- **Text:** primary `#EDEDEF`, secondary `#8B8B92`
- **Accent (single):** electric lime `#C6F432` — used ONLY for the score,
  primary actions, and pass states
- **Severity:** error `#FF5C5C`, warn `#FFB224`, info `#5CA8FF` — muted
  versions for backgrounds at 12% opacity
- **Type:** mono-first identity (Geist Mono class); docs body in Geist/Inter

## Terminal

- Summary card: box-drawn, composite score as a filled bar with the accent,
  five category mini-bars beneath
- Findings grouped by category, severity glyphs (`✖ ▲ ●`), file:line dimmed,
  one-line message, `↳ fix:` hint pointing to the prompt/generator
- Breathing room: blank line between groups; never wall-of-text
- Respect `NO_COLOR`; degrade gracefully to ASCII on dumb terminals

## HTML Report (the screenshot artifact)

- Hero: animated radial composite score (the Lighthouse move), repo name,
  timestamp, trend delta vs last run
- Radar chart of the five axes
- Finding cards: severity-coded left border, expandable code snippet,
  **Copy fix prompt** button (primary interaction)
- Token treemap: which files eat the AI context window
- Self-contained: inline CSS/JS/fonts-fallback, zero network, dark-first
  with a light toggle

## Docs Site (phase 4)

- Landing: live terminal animation of an audit run; score badge; single CTA
  `npx pickcheck audit`
- Playbook rendered as clean reading experience (Fumadocs base, restyled to
  this palette)
- Every rule README auto-published as a docs page (rules/ is the CMS)

## Voice

- Findings state facts + consequences, never scold: "Errors are being
  silently swallowed" not "You forgot error handling"
- Fix prompts are imperative, specific, and reference the user's real paths
- Score copy is motivational-neutral: "34 → 61 since last run"
