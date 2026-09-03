import { DARK_ROOT_TOKENS, LIGHT_ROOT_TOKEN_OVERRIDES } from "./palette.js";
import { computeTreemap } from "./treemap.js";
import type {
  Category,
  ReportCategoryScore,
  ReportData,
  ReportFinding,
  ReportHistoryPoint,
  ReportTokenSurface,
} from "./types.js";

/**
 * Display names for each category slug. Needed because CSS
 * `text-transform: capitalize` treats a hyphen as a word boundary in most
 * browsers — `ui-ux` renders as "Ui-Ux", not "UI/UX" — and no CSS
 * transform can turn a hyphen into a slash regardless. Every place a
 * category renders as user-facing text goes through `categoryLabel()`
 * instead of the raw slug.
 */
const CATEGORY_LABELS: Record<Category, string> = {
  security: "Security",
  quality: "Quality",
  docs: "Docs",
  discipline: "Discipline",
  "ui-ux": "UI/UX",
  tokens: "Tokens",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as Category] ?? category;
}

/**
 * The whole HTML report: DESIGN.md's "screenshot artifact" surface.
 * Everything — CSS, JS, and the audit data itself — is inlined into one
 * file so it opens from disk over `file://` with zero network requests,
 * forever (CLAUDE.md's "no network calls at runtime" applies to this
 * output the same as it does to the engine). See DECISIONS/0019.
 */
export function renderReportHtml(data: ReportData): string {
  const title = `pickcheck — ${escapeHtml(data.repoName)}`;
  // Sorted once, up front, into the same category -> severity order the
  // findings section renders — both the embedded fix-prompt JSON and each
  // card's data-finding-index are derived from this single ordering, so
  // they can never drift apart (see buildFindingsSection).
  const orderedFindings = orderFindings(
    data.findings,
    data.categories.map((entry) => entry.category),
  );
  const fixPrompts = orderedFindings.map((finding) => finding.fixPrompt);

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${css()}</style>
</head>
<body>
<a class="skip-link" href="#findings">Skip to findings</a>
<header class="topbar">
  <div class="wordmark">pickcheck</div>
  <button type="button" id="theme-toggle" aria-pressed="false">
    <span class="theme-toggle-label">Light mode</span>
  </button>
</header>
<main>
${buildHero(data)}
${buildRadarSection(data.categories)}
${buildTokenSurfaceSection(data.tokenSurface)}
${buildFindingsSection(orderedFindings)}
${buildWarningsSection(data.warnings)}
</main>
<footer class="report-footer">
  <p>
    pickcheck ${escapeHtml(data.pickcheckVersion)} · ruleset ${escapeHtml(data.rulesetVersion)} ·
    ${data.ruleCount} rules · ${data.fileCount} files scanned
  </p>
  <p class="report-footer-note">Generated entirely offline — no network requests, no external assets.</p>
</footer>
<script type="application/json" id="pickcheck-fix-prompts">${safeJsonForScript(fixPrompts)}</script>
<script>${clientScript()}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Hero: radial composite score, repo identity, trend
// ---------------------------------------------------------------------------

function buildHero(data: ReportData): string {
  const composite = clamp(data.composite, 0, 100);
  const ring = buildScoreRing(composite);
  const trend = buildTrend(data.previous, composite);
  const sparkline = buildSparkline(data.history);

  return `<section class="hero">
  <div class="hero-score">
    ${ring}
  </div>
  <div class="hero-meta">
    <h1>${escapeHtml(data.repoName)}</h1>
    <p class="hero-timestamp">${escapeHtml(formatTimestamp(data.generatedAt))}</p>
    ${trend}
    ${sparkline}
  </div>
</section>`;
}

function buildScoreRing(composite: number): string {
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - composite / 100);

  return `<svg class="score-ring" width="200" height="200" viewBox="0 0 200 200" role="img"
       aria-label="Composite score ${roundLabel(composite)} out of 100">
  <circle class="score-ring-track" cx="100" cy="100" r="${radius}" />
  <circle class="score-ring-fill" cx="100" cy="100" r="${radius}"
          style="--circumference: ${circumference}; --target-offset: ${offset};"
          transform="rotate(-90 100 100)" />
  <text class="score-ring-number" x="100" y="94" text-anchor="middle" data-target="${roundLabel(composite)}">0</text>
  <text class="score-ring-suffix" x="100" y="122" text-anchor="middle">/ 100</text>
</svg>`;
}

function buildTrend(previous: ReportData["previous"], composite: number): string {
  if (previous === undefined) {
    return `<p class="hero-trend hero-trend-first">First recorded run — nothing to compare yet.</p>`;
  }

  const delta = round(composite - previous.composite);
  const sign = delta > 0 ? "+" : "";
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const caveat = previous.sameRuleset
    ? ""
    : `<span class="hero-trend-caveat">ruleset changed since last run — not a pure comparison</span>`;

  return `<p class="hero-trend hero-trend-${direction}">
    ${roundLabel(previous.composite)} → ${roundLabel(composite)} since last run
    <span class="hero-trend-delta">(${sign}${delta})</span>
    ${caveat}
  </p>`;
}

function buildSparkline(history: ReportHistoryPoint[]): string {
  if (history.length < 2) {
    return "";
  }

  const width = 220;
  const height = 40;
  const pad = 4;
  const points = history.map((point, index) => {
    const x = (index / (history.length - 1)) * (width - pad * 2) + pad;
    const y =
      height - pad - (clamp(point.composite, 0, 100) / 100) * (height - pad * 2);
    return `${round(x)},${round(y)}`;
  });

  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
       role="img" aria-label="Composite score over the last ${history.length} runs">
  <polyline points="${points.join(" ")}" />
</svg>`;
}

// ---------------------------------------------------------------------------
// Radar chart: hand-rolled SVG, no chart library
// ---------------------------------------------------------------------------

function buildRadarSection(categories: ReportCategoryScore[]): string {
  if (categories.length === 0) {
    return "";
  }

  return `<section class="radar-section" aria-labelledby="radar-heading">
  <h2 id="radar-heading">Category scores</h2>
  <div class="radar-layout">
    ${buildRadarChart(categories)}
    <ul class="category-legend">
      ${categories.map((entry) => buildCategoryLegendRow(entry)).join("\n")}
    </ul>
  </div>
</section>`;
}

function buildCategoryLegendRow(entry: ReportCategoryScore): string {
  return `<li>
    <span class="category-legend-label">${escapeHtml(categoryLabel(entry.category))}</span>
    <span class="category-legend-bar"><span style="width: ${clamp(entry.score, 0, 100)}%"></span></span>
    <span class="category-legend-score">${roundLabel(entry.score)}</span>
  </li>`;
}

function buildRadarChart(categories: ReportCategoryScore[]): string {
  // A root <svg> doesn't clip content to its viewBox by default (unlike a
  // nested one) — a label with text-anchor "start"/"end" near the ±30°/
  // ±150° axes extends ~50px sideways from its anchor point, so the
  // canvas needs real margin past `labelRadius`, not just enough for the
  // label's own anchor point to land inside the viewBox. Verified by
  // rendering an actual report and screenshotting it — an earlier, tighter
  // size (320/110/+34) let "quality"/"docs" overflow into the legend list
  // next to it.
  const size = 400;
  const center = size / 2;
  const maxRadius = 110;
  const labelRadius = maxRadius + 40;
  const count = categories.length;
  const angleFor = (index: number) => (Math.PI * 2 * index) / count - Math.PI / 2;

  const grid = [25, 50, 75, 100]
    .map((level) => {
      const ringPoints = categories
        .map((_, index) =>
          pointOnCircle(center, center, (maxRadius * level) / 100, angleFor(index)),
        )
        .map(([x, y]) => `${round(x)},${round(y)}`)
        .join(" ");
      return `<polygon class="radar-grid" points="${ringPoints}" />`;
    })
    .join("\n");

  const spokes = categories
    .map((_, index) => {
      const [x, y] = pointOnCircle(center, center, maxRadius, angleFor(index));
      return `<line class="radar-spoke" x1="${center}" y1="${center}" x2="${round(x)}" y2="${round(y)}" />`;
    })
    .join("\n");

  const dataPoints = categories.map((entry, index) => {
    const [x, y] = pointOnCircle(
      center,
      center,
      (maxRadius * clamp(entry.score, 0, 100)) / 100,
      angleFor(index),
    );
    return [round(x), round(y)];
  });
  const dataPolygon = dataPoints.map(([x, y]) => `${x},${y}`).join(" ");
  const dataDots = dataPoints
    .map(([x, y]) => `<circle class="radar-dot" cx="${x}" cy="${y}" r="3.5" />`)
    .join("\n");

  const labels = categories
    .map((entry, index) => {
      const [x, y] = pointOnCircle(center, center, labelRadius, angleFor(index));
      const anchor = anchorFor(x, center);
      return `<text class="radar-label" x="${round(x)}" y="${round(y)}" text-anchor="${anchor}">${escapeHtml(categoryLabel(entry.category))}</text>`;
    })
    .join("\n");

  return `<svg class="radar-chart" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
       role="img" aria-label="Radar chart of category scores: ${categories
         .map((c) => `${categoryLabel(c.category)} ${roundLabel(c.score)}`)
         .join(", ")}">
  ${grid}
  ${spokes}
  <polygon class="radar-data" points="${dataPolygon}" />
  ${dataDots}
  ${labels}
</svg>`;
}

function pointOnCircle(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): [number, number] {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function anchorFor(x: number, center: number): "start" | "middle" | "end" {
  if (Math.abs(x - center) < 4) return "middle";
  return x > center ? "start" : "end";
}

// ---------------------------------------------------------------------------
// Token treemap (unscored AI-context-surface report)
// ---------------------------------------------------------------------------

function buildTokenSurfaceSection(surface: ReportTokenSurface | undefined): string {
  if (surface === undefined) {
    return "";
  }

  const treemap = surface.files.length > 0 ? buildTreemapSvg(surface) : "";
  const coverage = buildIgnoreCoverage(surface);

  if (treemap === "" && coverage === "") {
    return "";
  }

  return `<section class="tokens-section" aria-labelledby="tokens-heading">
  <h2 id="tokens-heading">AI context surface</h2>
  ${
    surface.files.length > 0
      ? `<p class="tokens-summary">${surface.totalTokens} tokens across ${surface.files.length} file(s) · est. ${surface.estimatedWastePercent}% waste</p>`
      : ""
  }
  ${treemap}
  ${coverage}
</section>`;
}

function buildTreemapSvg(surface: ReportTokenSurface): string {
  const width = 640;
  const height = 220;
  const sorted = [...surface.files].sort((a, b) => b.tokens - a.tokens);
  const rects = computeTreemap(
    sorted.map((file) => ({ label: file.file, value: file.tokens })),
    0,
    0,
    width,
    height,
  );
  const maxTokens = Math.max(...sorted.map((f) => f.tokens), 1);

  const cells = rects
    .map((rect) => {
      const mixPercent = Math.round((15 + 55 * (rect.value / maxTokens)) * 100) / 100;
      const showLabel = rect.width > 60 && rect.height > 24;
      const label = showLabel
        ? `<text x="${round(rect.x + 6)}" y="${round(rect.y + 16)}" class="treemap-label">${escapeHtml(shortenPath(rect.label))}</text>
         <text x="${round(rect.x + 6)}" y="${round(rect.y + 30)}" class="treemap-sublabel">${rect.value} tok</text>`
        : "";
      return `<g>
        <title>${escapeHtml(rect.label)} — ${rect.value} tokens</title>
        <rect x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.width)}" height="${round(rect.height)}"
              class="treemap-cell" style="--mix: ${mixPercent}%;" />
        ${label}
      </g>`;
    })
    .join("\n");

  return `<svg class="treemap" width="100%" height="${height}" viewBox="0 0 ${width} ${height}"
       preserveAspectRatio="none" role="img" aria-label="Token treemap: ${sorted
         .map((f) => `${f.file} ${f.tokens} tokens`)
         .join(", ")}">
  ${cells}
</svg>`;
}

function buildIgnoreCoverage(surface: ReportTokenSurface): string {
  const uncovered = surface.uncoveredArtifacts.filter((artifact) => !artifact.covered);
  if (uncovered.length === 0) {
    return "";
  }
  const label =
    surface.ignoreFilesFound.length > 0
      ? `not covered by ${surface.ignoreFilesFound.join(", ")}`
      : "no AI-ignore file found (.cursorignore/.claudeignore/etc.)";

  return `<div class="ignore-coverage">
    <p>${uncovered.length} artifact(s) ${escapeHtml(label)}:</p>
    <ul>
      ${uncovered.map((artifact) => `<li>${escapeHtml(artifact.target)}</li>`).join("\n")}
    </ul>
  </div>`;
}

function shortenPath(path: string): string {
  return path.length > 40 ? `…${path.slice(-39)}` : path;
}

// ---------------------------------------------------------------------------
// Findings: grouped by category -> severity, expandable snippet, copy button
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { error: 0, warn: 1, info: 2 };
const SEVERITY_GLYPH: Record<string, string> = { error: "✖", warn: "▲", info: "●" };

/**
 * Sorts by category (in `categoryOrder`'s rank) then severity
 * (error -> warn -> info), stably — Array#sort is spec-guaranteed stable,
 * so findings that tie on both keep their original relative order. An
 * unrecognized category (shouldn't happen; every finding's category comes
 * from CATEGORY_WEIGHTS) sorts after every known one rather than crashing.
 */
function orderFindings(
  findings: ReportFinding[],
  categoryOrder: string[],
): ReportFinding[] {
  const categoryRank = new Map(
    categoryOrder.map((category, index) => [category, index]),
  );
  return [...findings].sort((a, b) => {
    const categoryDiff =
      (categoryRank.get(a.category) ?? categoryOrder.length) -
      (categoryRank.get(b.category) ?? categoryOrder.length);
    if (categoryDiff !== 0) return categoryDiff;
    return (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
  });
}

/**
 * `orderedFindings` must already be sorted (see `orderFindings`) — cards
 * are grouped by detecting consecutive runs of the same category, and each
 * card's index is its position in this exact array, which is also the
 * order the embedded fix-prompt JSON was built in.
 */
function buildFindingsSection(orderedFindings: ReportFinding[]): string {
  if (orderedFindings.length === 0) {
    return `<section id="findings" class="findings-section">
  <h2>Findings</h2>
  <p class="empty-state">No findings. Every checked rule passed.</p>
</section>`;
  }

  const groups: string[] = [];
  let index = 0;
  while (index < orderedFindings.length) {
    const category = orderedFindings[index]?.category;
    const cards: string[] = [];
    while (
      index < orderedFindings.length &&
      orderedFindings[index]?.category === category
    ) {
      const finding = orderedFindings[index] as ReportFinding;
      cards.push(buildFindingCard(finding, index));
      index++;
    }
    groups.push(`<div class="finding-group">
      <h3>${escapeHtml(categoryLabel(String(category)))} <span class="finding-count">${cards.length}</span></h3>
      <div class="finding-cards">${cards.join("\n")}</div>
    </div>`);
  }

  return `<section id="findings" class="findings-section" aria-labelledby="findings-heading">
  <h2 id="findings-heading">Findings</h2>
  ${groups.join("\n")}
</section>`;
}

function buildFindingCard(finding: ReportFinding, index: number): string {
  const location =
    finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  const glyph = SEVERITY_GLYPH[finding.severity] ?? "●";

  return `<article class="finding-card sev-${finding.severity}">
  <div class="finding-head">
    <span class="finding-severity">${glyph} <span>${finding.severity}</span></span>
    <span class="finding-location">${escapeHtml(location)}</span>
  </div>
  <p class="finding-message">${escapeHtml(finding.message)}</p>
  <p class="finding-rule">${escapeHtml(finding.ruleTitle)} <code>${escapeHtml(finding.ruleId)}</code></p>
  ${buildSnippet(finding)}
  <button type="button" class="copy-fix-prompt" data-finding-index="${index}">
    Copy fix prompt
  </button>
</article>`;
}

function buildSnippet(finding: ReportFinding): string {
  if (finding.snippet === undefined || finding.snippet.length === 0) {
    return "";
  }

  const lines = finding.snippet
    .map(
      (line) =>
        `<span class="snippet-line${line.highlighted ? " snippet-line-hl" : ""}"><span class="snippet-ln">${line.number}</span><span class="snippet-code">${escapeHtml(line.text)}</span></span>`,
    )
    .join("\n");

  return `<details class="snippet-details">
    <summary>Show code</summary>
    <pre class="snippet"><code>${lines}</code></pre>
  </details>`;
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

function buildWarningsSection(warnings: string[]): string {
  if (warnings.length === 0) {
    return "";
  }
  return `<section class="warnings-section" aria-labelledby="warnings-heading">
  <h2 id="warnings-heading">Warnings</h2>
  <ul>
    ${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("\n")}
  </ul>
</section>`;
}

// ---------------------------------------------------------------------------
// CSS — DESIGN.md palette, dark-first with a manual light toggle
// ---------------------------------------------------------------------------

function css(): string {
  return `
/*
 * Dark-first per DESIGN.md: bare :root (no [data-theme] attribute, no
 * prefers-color-scheme query) IS the dark palette — the report looks the
 * same regardless of the viewer's OS setting until they explicitly click
 * the toggle. Light is reached only via :root[data-theme="light"], set by
 * clientScript() below (defaulting to dark, restored from localStorage).
 */
:root {
  color-scheme: dark;
${DARK_ROOT_TOKENS}  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Consolas, "Liberation Mono", monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

:root[data-theme="light"] {
  color-scheme: light;
${LIGHT_ROOT_TOKEN_OVERRIDES}  /*
   * The raw accent lime blended toward --panel (the treemap's fill
   * formula) reads as a solid, over-saturated block on a white --panel —
   * a look dark mode's near-black --panel doesn't have, since the same
   * blend reads as "the one sharp accent" against near-black rather than
   * "a bright yellow-green rectangle." Scaling the blend ratio down
   * (not the accent color itself — DESIGN.md's single-accent rule is
   * unchanged) keeps the same relative size-to-intensity mapping between
   * cells while landing much closer to --panel overall.
   */
  --treemap-mix-scale: 0.45;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
}

body { padding-bottom: 4rem; }

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--accent);
  color: var(--accent-contrast);
  padding: 0.5rem 1rem;
  z-index: 10;
}
.skip-link:focus { left: 0.5rem; top: 0.5rem; }

button {
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
}
button:focus-visible, summary:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  border-bottom: 1px solid var(--border);
}
.wordmark {
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: -0.02em;
}
#theme-toggle {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
}
#theme-toggle:hover { border-color: var(--accent); }

main { max-width: 1240px; margin: 0 auto; padding: 0 2rem; }

h1, h2, h3 { font-family: var(--font-mono); letter-spacing: -0.01em; margin: 0 0 0.5rem; }
h1 { font-size: 1.5rem; }
h2 { font-size: 1.1rem; margin-top: 3rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
h3 { font-size: 0.95rem; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; }

.hero {
  display: flex;
  align-items: center;
  gap: 2.5rem;
  padding: 3rem 0 1rem;
  flex-wrap: wrap;
}
.score-ring { flex-shrink: 0; }
.score-ring-track {
  fill: none;
  stroke: var(--border);
  stroke-width: 10;
}
.score-ring-fill {
  fill: none;
  stroke: var(--accent);
  stroke-width: 10;
  stroke-linecap: round;
  stroke-dasharray: var(--circumference);
  stroke-dashoffset: var(--circumference);
  transition: stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1);
}
.score-ring-fill.ring-loaded { stroke-dashoffset: var(--target-offset); }
.score-ring-number { fill: var(--text); font-family: var(--font-mono); font-size: 2.6rem; font-weight: 700; }
.score-ring-suffix { fill: var(--text-2); font-family: var(--font-mono); font-size: 0.85rem; }

.hero-meta { min-width: 240px; }
.hero-timestamp { color: var(--text-2); margin: 0 0 0.75rem; font-family: var(--font-mono); font-size: 0.85rem; }
.hero-trend { margin: 0 0 0.75rem; font-family: var(--font-mono); font-size: 0.9rem; }
.hero-trend-delta { color: var(--text-2); }
.hero-trend-up .hero-trend-delta { color: var(--accent-ink); }
.hero-trend-first { color: var(--text-2); }
.hero-trend-caveat {
  display: block;
  color: var(--text-2);
  font-family: var(--font-sans);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}
.sparkline polyline { fill: none; stroke: var(--accent-ink); stroke-width: 2; }

.radar-layout { display: flex; align-items: center; gap: 2rem; flex-wrap: wrap; }
.radar-grid { fill: none; stroke: var(--border); stroke-width: 1; }
.radar-spoke { stroke: var(--border); stroke-width: 1; }
.radar-data { fill: rgba(198, 244, 50, 0.16); stroke: var(--accent-ink); stroke-width: 2; }
.radar-dot { fill: var(--accent-ink); }
.radar-label { fill: var(--text-2); font-family: var(--font-mono); font-size: 11px; }

.category-legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 220px; }
.category-legend li {
  display: grid;
  grid-template-columns: 90px 1fr 40px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
.category-legend-label { color: var(--text-2); }
.category-legend-bar { background: var(--border); border-radius: 3px; height: 6px; overflow: hidden; }
.category-legend-bar span { display: block; height: 100%; background: var(--accent-ink); }
.category-legend-score { text-align: right; }

.tokens-summary { color: var(--text-2); font-family: var(--font-mono); font-size: 0.85rem; }
.treemap { display: block; margin-top: 1rem; border-radius: 6px; overflow: hidden; }
.treemap-cell {
  /*
   * --mix (set per-cell in the inline style attribute) is the raw
   * proportional blend computed at render time and is theme-agnostic —
   * the same markup is reused across both themes by the CSS toggle, so
   * it can't itself carry a "lighter in light mode" adjustment. --treemap-
   * mix-scale is that per-theme adjustment: 1 (full strength) in dark,
   * dialed back in light — see the light :root block for why.
   */
  fill: color-mix(
    in srgb,
    var(--accent) calc(var(--mix) * var(--treemap-mix-scale, 1)),
    var(--panel)
  );
  stroke: var(--bg);
  stroke-width: 2;
}
.treemap-label { fill: var(--accent-contrast); font-family: var(--font-mono); font-size: 11px; font-weight: 600; }
.treemap-sublabel { fill: var(--accent-contrast); font-family: var(--font-mono); font-size: 10px; opacity: 0.75; }
.ignore-coverage { margin-top: 1rem; color: var(--text-2); font-size: 0.85rem; }
.ignore-coverage ul { margin: 0.25rem 0 0; padding-left: 1.25rem; }

.finding-group { margin-top: 1.5rem; }
.finding-count {
  display: inline-block;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  color: var(--text-2);
}
/*
 * A single flex column of cards spanning the full (now 1240px) main width
 * left a lot of dead space on the right of most cards' short messages at
 * 1440px+ — a 2-up grid fills that width with content instead of margin.
 * minmax(min(420px, 100%), 1fr) is the overflow-safe idiom: the 420px
 * floor never exceeds the container on a narrow viewport, so this needs
 * no separate mobile media query — it already reduces to one column
 * whenever two 420px+ tracks wouldn't fit.
 */
.finding-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
  align-items: start;
}
.finding-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 6px;
  padding: 1rem 1.25rem;
}
.finding-card.sev-error { border-left-color: var(--sev-error); }
.finding-card.sev-warn { border-left-color: var(--sev-warn); }
.finding-card.sev-info { border-left-color: var(--sev-info); }
.finding-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.35rem; }
.finding-severity { font-family: var(--font-mono); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
.sev-error .finding-severity { color: var(--sev-error); }
.sev-warn .finding-severity { color: var(--sev-warn); }
.sev-info .finding-severity { color: var(--sev-info); }
.finding-location { font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-2); }
.finding-message { margin: 0 0 0.35rem; }
.finding-rule { margin: 0 0 0.5rem; color: var(--text-2); font-size: 0.8rem; }
.finding-rule code { font-family: var(--font-mono); }

.snippet-details { margin: 0.5rem 0; }
.snippet-details summary {
  cursor: pointer;
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  user-select: none;
}
.snippet {
  margin: 0.5rem 0 0;
  padding: 0.5rem 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.82rem;
}
.snippet-line { display: block; padding: 0 0.75rem; white-space: pre; }
.snippet-line-hl { background: var(--sev-error-bg); box-shadow: inset 3px 0 var(--sev-error); }
.snippet-ln { display: inline-block; width: 2.5rem; color: var(--text-2); user-select: none; }

.copy-fix-prompt {
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.9rem;
  font-weight: 600;
  font-size: 0.85rem;
}
.copy-fix-prompt:hover { filter: brightness(1.05); }
.copy-fix-prompt.copied { background: var(--text-2); }

.empty-state { color: var(--text-2); }
.warnings-section ul { color: var(--text-2); font-size: 0.85rem; }

.report-footer {
  max-width: 1240px;
  margin: 3rem auto 0;
  padding: 1.5rem 2rem 0;
  border-top: 1px solid var(--border);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 0.78rem;
}
.report-footer-note { opacity: 0.7; }

@media (prefers-reduced-motion: reduce) {
  .score-ring-fill { transition: none; }
}

@media (max-width: 640px) {
  .radar-layout { flex-direction: column; }
  .category-legend li { grid-template-columns: 80px 1fr 36px; }
}
`;
}

// ---------------------------------------------------------------------------
// Client-side JS — theme toggle, score count-up, copy-to-clipboard.
// Everything else (snippet expand/collapse) is native <details>/<summary>.
// ---------------------------------------------------------------------------

function clientScript(): string {
  return `
(function () {
  "use strict";
  var THEME_KEY = "pickcheck-report-theme";
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  var toggleLabel = toggle ? toggle.querySelector(".theme-toggle-label") : null;

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (toggle) toggle.setAttribute("aria-pressed", String(theme === "light"));
    if (toggleLabel) toggleLabel.textContent = theme === "light" ? "Dark mode" : "Light mode";
  }

  var storedTheme = null;
  try { storedTheme = window.localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(storedTheme === "light" ? "light" : "dark");

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      try { window.localStorage.setItem(THEME_KEY, next); } catch (e) {}
    });
  }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ring = document.querySelector(".score-ring-fill");
  var numberEl = document.querySelector(".score-ring-number");
  var target = numberEl ? Number(numberEl.getAttribute("data-target")) || 0 : 0;

  function animateScore() {
    if (reduceMotion) {
      if (numberEl) numberEl.textContent = String(target);
      return;
    }
    var start = null;
    var duration = 1100;
    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min(1, (timestamp - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      if (numberEl) numberEl.textContent = String(Math.round(target * eased));
      if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  window.requestAnimationFrame(function () {
    if (ring) ring.classList.add("ring-loaded");
    animateScore();
  });

  var fixPromptsEl = document.getElementById("pickcheck-fix-prompts");
  var fixPrompts = [];
  try { fixPrompts = JSON.parse(fixPromptsEl ? fixPromptsEl.textContent : "[]"); } catch (e) {}

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(textarea);
  }

  document.querySelectorAll(".copy-fix-prompt").forEach(function (button) {
    button.addEventListener("click", function () {
      var index = Number(button.getAttribute("data-finding-index"));
      var text = fixPrompts[index];
      if (typeof text !== "string") return;

      var showCopied = function () {
        var original = button.textContent;
        button.textContent = "Copied!";
        button.classList.add("copied");
        window.setTimeout(function () {
          button.textContent = original;
          button.classList.remove("copied");
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopied, function () {
          fallbackCopy(text);
          showCopied();
        });
      } else {
        fallbackCopy(text);
        showCopied();
      }
    });
  });
})();
`;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * `JSON.stringify` never escapes `<`, so a fix prompt containing the
 * literal text `</script>` would otherwise prematurely close the embedded
 * `<script type="application/json">` block and inject whatever follows as
 * raw HTML/script — a classic JSON-in-HTML injection. Escaping every `<`
 * as its JSON unicode escape sidesteps the whole class of `</script`,
 * `<!--`, etc. edge cases at once; `JSON.parse` decodes `<` back to
 * `<` correctly, so the round-tripped value is unaffected.
 */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}
