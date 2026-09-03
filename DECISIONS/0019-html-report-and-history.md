# ADR 0019 — `audit --report`: self-contained HTML report, run history, and a ruleset fingerprint

**Status:** accepted · **Date:** 2026-09-03

## Context

EXECUTION.md's Phase 4 asks for `audit --report`: a single self-contained
HTML file (hero score, radar chart, finding cards with expandable
snippets and copy-fix-prompt buttons, a token treemap, dark-first with a
light toggle) plus `.pickcheck/history.json` trend tracking, per
DESIGN.md's palette and "one identity across three surfaces" mandate.
Several sub-decisions came up building it.

## Decision

### Package boundary: `@pickcheck/report` owns the template, `packages/cli` owns the adapter

`packages/report/src/render.ts` exports `renderReportHtml(data:
ReportData): string` — a pure function from a fully-prepared,
JSON-serializable `ReportData` to the complete HTML document string (CSS
and JS inlined, per CLAUDE.md's "no network calls at runtime").
`packages/cli/src/render/html.ts`'s `buildReportHtml(result, options)`
adapts an `AuditResult` (plus `cwd`, `repoName`, `generatedAt`, and prior
`history` entries) into that `ReportData` — resolving each finding's rule
metadata, reading a code snippet off disk (`render/snippet.ts`), and
shaping the token-surface report. This mirrors the existing
`@pickcheck/rules` boundary: the template package holds no engine-specific
types (it re-exports `Category`/`Severity` from `@pickcheck/rules/schema`,
same as `packages/cli/src/engine/types.ts` does), and ships as bare `.ts`
source resolved via `exports` in its `package.json` — no build step,
consistent with how `@pickcheck/rules` is already consumed.

### Snippets are read from disk at render time, not carried on `Finding`

`Finding` stays `{ ruleId, file, line?, severity, message, fixPrompt }`.
Adding a snippet field there would mean every tier reads and slices
source around every finding on every `audit` run, including `--json` and
plain terminal runs that never display one. Instead
`render/snippet.ts#extractSnippet` reads a small window (3 lines each
side) directly from the audited repo's files, only when `--report` is
requested, with a per-render `Map<file, string[] | undefined>` cache so N
findings in the same file cost one read. Same "never crash" contract as
every other file read in this codebase: an unreadable file (deleted since
the scan, binary, permissions) just means no snippet for that finding.

### The embedded fix-prompt JSON is escaped against JSON-in-`<script>` injection

The report embeds `<script type="application/json" id="pickcheck-fix-
prompts">` so the "Copy fix prompt" button never needs arbitrary text
smuggled through an HTML attribute. `JSON.stringify` does not escape `<`,
so a fix prompt (or, more generally, any scanned file's content reaching
the page) containing the literal text `</script>` would otherwise
prematurely close that block and inject whatever follows as raw
HTML/script — a well-known JSON-in-HTML injection class. `render.ts`'s
`safeJsonForScript()` replaces every `<` with the six-character JSON
unicode escape sequence for it (backslash, `u`, `0`, `0`, `3`, `c`) before
embedding; `JSON.parse` decodes that escape back to a literal `<`
correctly, so the round-tripped value is unaffected. Every other
user-controlled string reaching the page (messages, file paths, snippet
lines, warnings) goes through `escapeHtml()` and is rendered as text
content, never as markup.

### `.pickcheck/history.json` and the ruleset fingerprint

`engine/history.ts` reads/appends a flat, chronological JSON array (capped
at the 200 most recent entries) of `{ timestamp, composite, categories,
findingCount, rulesetVersion }`. Two choices here:

1. **History is appended on every `audit` run, not gated behind
   `--report`.** EXECUTION.md's Phase 3 already lists history tracking as
   its own bullet, independent of the Phase 4 report — and gating it
   behind `--report` would mean a repo's first `--report` run has no
   trend to show unless the user happened to already be passing
   `--report` on prior runs. `commands/audit.ts` reads history before
   running the audit (so the report only ever sees *prior* runs) and
   appends the new entry after rendering, regardless of `--json`/
   `--quiet`/`--report`.
2. **`rulesetVersion` is a content fingerprint
   (`computeRulesetFingerprint()`: sha256 of each loaded rule's
   `id@severity@weight@tier`, sorted, truncated to 12 hex chars), not
   `@pickcheck/rules`' hand-bumped `package.json` version.** That version
   is currently frozen at `0.0.1` and isn't bumped per rule addition (see
   e.g. `sec/raw-card-input-no-payment-sdk` landing without a version
   bump) — it would silently claim every historical run is "the same
   ruleset" regardless of how many rules changed. The fingerprint changes
   automatically and deterministically whenever a rule is added, removed,
   or has its id/severity/weight/tier edited, which is exactly what
   determines whether two runs' scores are a fair comparison. The report
   surfaces this: `previous.sameRuleset === false` renders a "ruleset
   changed since last run — not a pure comparison" caveat next to the
   trend delta, per DESIGN.md's "motivational-neutral" score copy — it
   never hides or refuses the comparison, just flags it.

### `--report [path]` is additive, not a replacement output mode

`--report` (default `.pickcheck/report.html`, overridable) writes the
HTML file *alongside* whichever of `--json`/`--quiet`/terminal was
already selected, rather than becoming a fourth mutually-exclusive output
mode. `--json` gains an optional `reportPath` field (only present when
`--report` was passed) so it stays valid, parseable JSON with no
side-channel text; `--quiet` appends `· report: <path>`; the terminal
renderer appends a `Report written to <path>` line after warnings. A
failure writing the report (permissions, disk full) is caught and turned
into a warning rather than failing the whole audit — consistent with
CLAUDE.md's "engine failures... log a warning and continue."

### `ux/inline-hex-threshold`'s regex gained a definition-vs-usage distinction, not a path exclusion

Building the report's CSS surfaced a real false positive: DESIGN.md's
palette, transcribed once into `packages/report/src/palette.ts` as ~15
raw hex literals and referenced everywhere else via `var(--token)`, is
exactly the "shared design-token/theme reference" this rule's own message
asks *other* files to adopt — but it still tripped the rule itself
(`minCount: 5` on raw file text, tier-agnostic to *why* a hex literal is
present).

The rule's own README already names this as a known, accepted limitation
("can't tell a real design-token drift problem from a file that's
supposed to define a palette... exclude those paths from `files` (or
raise the threshold) if this rule fires there") — but a **path- or
name-based** exclusion was rejected: `fixtures/bad/src/Palette.tsx`
already exists specifically to prove that naming a file "Palette" and
scattering hex through inline styles must still trigger. Adding `!
**/palette.*` (or `theme.*`/`tokens.*`) would reopen exactly the loophole
that fixture guards against, for every pickcheck user, not just this
file — trading a real detector capability away for a one-file
convenience is precisely what CLAUDE.md's "never relax a rule to make
ourselves pass" forbids, regardless of how the timing looks.

Instead, the regex gained a negative lookbehind — `(?<!--[\w-]+:\s*)#[0-
9a-fA-F]{3,8}\b` — that excludes a hex literal only when it's the value
of a CSS custom-property *declaration* (`--token-name: #hex;`), the
token *definition* site, while still counting the exact same literal
anywhere else (`color: #hex`, `background: #hex`, `style={{ color:
"#hex" }}`, etc. all still match). This is a real, generalizable
precision improvement — any pickcheck user's genuine `:root { --x: #hex;
}` design-tokens file benefits, not just this one — verified against the
existing `fixtures/bad/src/Palette.tsx` (still triggers: hex used in
inline styles, not custom-property declarations) and a new
`fixtures/good/src/design-tokens.css` (many hex values, all as `--name:
#hex` declarations, must not trigger). `packages/report/src/palette.ts`
was written as real CSS custom-property text for exactly this reason —
expressing the palette in its native declaration syntax is the honest
shape, not a contortion to satisfy the new regex. `pnpm corpus` against
all 8 corpus repos showed **no diff** — the fix changes nothing for any
file that wasn't itself a genuine custom-property token definition.

### Verified with a real browser, not just unit tests

Unit tests (`packages/report/test/render.test.ts`,
`packages/cli/test/render/html.test.ts`) cover escaping/injection-safety,
category-vs-fix-prompt index alignment, and the adapter's data shaping,
but none of them render actual pixels. Generating real reports for
`examples/broken-app` and this repo and inspecting them with a headless
browser caught two bugs neither test suite could: (1) the radar chart's
`size: 320` canvas was too tight for its own labels — a root `<svg>`
doesn't clip to its viewBox by default, so "quality"/"docs" (positioned
near ±30°, `text-anchor: start`) rendered ~10px past the edge, overlapping
the category legend next to it; fixed by widening the canvas (`size: 400`,
`labelRadius: maxRadius + 40`) with margin sized for the anchor behavior,
not just the label's own point. (2) `--report`'s dynamic `import("../
render/html.js")` threw `ERR_MODULE_NOT_FOUND` at runtime from the built
CLI — `@pickcheck/report`'s relative imports (`render.ts`'s `from "./
palette.js"`) were left external by tsup's default bundling and resolved,
at runtime, straight to the raw `.ts` source via the workspace symlink;
Node 22's native TypeScript execution loads a `.ts` file but does not
remap a `.js`-suffixed specifier back to a sibling `.ts` file the way
`tsc`/tsx do. Fixed via `noExternal: ["@pickcheck/report"]` in
`packages/cli/tsup.config.ts` — esbuild's bundler, unlike Node's runtime
loader, does understand that convention, so force-bundling means the
built CLI never touches report's raw `.ts` files at runtime at all.

## Consequences

- `packages/cli/package.json` gains `@pickcheck/report` as a workspace
  dependency; `commands/audit.ts` dynamic-imports `render/html.ts` (and
  therefore `@pickcheck/report` transitively) only when `--report` is
  passed, keeping the cold, no-`--report` path's import cost unchanged.
- `.pickcheck/history.json` (already gitignored) grows by one entry per
  `audit` run in any repo pickcheck audits, capped at 200 entries.
- `ux/inline-hex-threshold`'s detection got strictly more precise, not
  broader or narrower in scope — see corpus result above.
