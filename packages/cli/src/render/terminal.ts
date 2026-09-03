import { createColors } from "picocolors";
import type { AuditResult } from "../engine/audit.js";
import { CATEGORY_WEIGHTS } from "../engine/scorer.js";
import type { Category, Severity } from "../engine/types.js";
import { resolveTerminalMode } from "./terminal-mode.js";

export interface TerminalRenderOptions {
  /** Explicit override. Defaults to auto-detecting NO_COLOR from the environment. */
  color?: boolean;
  /** Explicit override. Defaults to auto-detecting TERM=dumb from the environment. */
  ascii?: boolean;
}

type Styler = (input: string) => string;
interface Styles {
  bold: Styler;
  dim: Styler;
  /** DESIGN.md's single accent (electric lime) — the score, and only the score. */
  accent: Styler;
  error: Styler;
  warn: Styler;
  info: Styler;
}

const IDENTITY_STYLES: Styles = {
  bold: (s) => s,
  dim: (s) => s,
  accent: (s) => s,
  error: (s) => s,
  warn: (s) => s,
  info: (s) => s,
};

// picocolors' default export auto-detects TTY/CI/NO_COLOR/TERM and no-ops
// itself when the environment looks non-interactive. That detection is
// redundant with (and can disagree with) resolveTerminalMode() below,
// which is what actually decides on/off here — so bypass picocolors' own
// detection with createColors(true) and always defer to ours.
const forcedColors = createColors(true);
const COLOR_STYLES: Styles = {
  bold: forcedColors.bold,
  dim: forcedColors.dim,
  // picocolors only reaches ANSI's 16-color set (no truecolor), so
  // DESIGN.md's electric lime `#C6F432` maps to its nearest ANSI
  // neighbor, bright green, rather than the literal hex.
  accent: forcedColors.greenBright,
  error: forcedColors.red,
  warn: forcedColors.yellow,
  info: forcedColors.blue,
};

interface Glyphs {
  topLeft: string;
  bottomLeft: string;
  side: string;
  separator: string;
  dash: string;
  fixArrow: string;
  ellipsis: string;
  severity: Record<Severity, string>;
}

const UNICODE_GLYPHS: Glyphs = {
  topLeft: "┌─ ",
  bottomLeft: "└─",
  side: "│ ",
  separator: " · ",
  dash: " — ",
  fixArrow: "↳",
  ellipsis: "…",
  severity: { error: "✖", warn: "▲", info: "●" },
};

const ASCII_GLYPHS: Glyphs = {
  topLeft: "+- ",
  bottomLeft: "+-",
  side: "| ",
  separator: " * ",
  dash: " - ",
  fixArrow: "->",
  ellipsis: "...",
  severity: { error: "x", warn: "!", info: "o" },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_WEIGHTS) as Category[];
const SEVERITY_ORDER: Severity[] = ["error", "warn", "info"];

const SCORE_BAR_WIDTH = 20;
const MINI_BAR_WIDTH = 14;
/** Longest row label ("discipline") — every summary-card row aligns to it. */
const LABEL_WIDTH = Math.max("Score".length, ...CATEGORY_ORDER.map((c) => c.length));
/** Keeps every renderer-composed line comfortably inside ARCHITECTURE.md's ~100-col budget. */
const MAX_LINE_WIDTH = 96;

/** Terminal report: box-drawn summary card, then findings grouped by category -> severity. */
export function renderTerminal(
  result: AuditResult,
  options: TerminalRenderOptions = {},
): string {
  const detected = resolveTerminalMode(process.env);
  const styles = (options.color ?? detected.color) ? COLOR_STYLES : IDENTITY_STYLES;
  const glyphs = (options.ascii ?? detected.ascii) ? ASCII_GLYPHS : UNICODE_GLYPHS;
  const ruleById = new Map(result.rules.map((rule) => [rule.id, rule]));

  const lines: string[] = [...renderSummaryCard(result, styles, glyphs), ""];

  if (result.findings.length === 0) {
    lines.push(styles.dim("No findings."));
  } else {
    for (const category of CATEGORY_ORDER) {
      const categoryFindings = result.findings.filter(
        (finding) => ruleById.get(finding.ruleId)?.category === category,
      );
      if (categoryFindings.length === 0) {
        continue;
      }

      const categoryScore =
        result.score.categories.find((entry) => entry.category === category)?.score ??
        100;
      lines.push(`${styles.bold(category)} (${styles.accent(String(categoryScore))})`);

      for (const severity of SEVERITY_ORDER) {
        for (const finding of categoryFindings.filter((f) => f.severity === severity)) {
          const location =
            finding.line === undefined
              ? finding.file
              : `${finding.file}:${finding.line}`;
          const glyph = severityGlyph(severity, styles, glyphs);
          lines.push(
            `  ${glyph} ${styles.dim(location)}${glyphs.dash}${finding.message}`,
          );
          lines.push(
            `    ${styles.dim(`${glyphs.fixArrow} fix: ${truncate(finding.fixPrompt, glyphs)}`)}`,
          );
        }
      }
      lines.push("");
    }
  }

  if (result.warnings.length > 0) {
    lines.push(styles.warn("Warnings:"));
    for (const warning of result.warnings) {
      lines.push(`  ${styles.dim("-")} ${warning}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** `--quiet`: a single CI-friendly line — composite score and the same counts, nothing else. */
export function renderQuietSummary(
  result: AuditResult,
  options: TerminalRenderOptions = {},
): string {
  const detected = resolveTerminalMode(process.env);
  const styles = (options.color ?? detected.color) ? COLOR_STYLES : IDENTITY_STYLES;
  const glyphs = (options.ascii ?? detected.ascii) ? ASCII_GLYPHS : UNICODE_GLYPHS;
  const composite = result.score.composite;
  const scoreText = styles.bold(styles.accent(`${composite}/100`));
  return `${scoreText}${glyphs.separator}${result.rules.length} rules${glyphs.separator}${result.fileCount} files${glyphs.separator}${result.findings.length} findings\n`;
}

function renderSummaryCard(
  result: AuditResult,
  styles: Styles,
  glyphs: Glyphs,
): string[] {
  const composite = result.score.composite;
  const rows = [
    scoreRow("Score", composite, SCORE_BAR_WIDTH, `${composite}/100`, styles, glyphs),
    ...CATEGORY_ORDER.map((category) => {
      const score =
        result.score.categories.find((entry) => entry.category === category)?.score ??
        100;
      return scoreRow(category, score, MINI_BAR_WIDTH, String(score), styles, glyphs);
    }),
  ];

  return [
    `${glyphs.topLeft}${styles.bold("pickcheck audit")}`,
    ...rows.map((row) => `${glyphs.side}${row}`),
    `${glyphs.side}${result.rules.length} rules${glyphs.separator}${result.fileCount} files${glyphs.separator}${result.findings.length} findings`,
    glyphs.bottomLeft,
  ];
}

function scoreRow(
  label: string,
  score: number,
  width: number,
  scoreText: string,
  styles: Styles,
  glyphs: Glyphs,
): string {
  return `${label.padEnd(LABEL_WIDTH)}  ${scoreBar(score, width, glyphs)} ${styles.accent(scoreText)}`;
}

function scoreBar(score: number, width: number, glyphs: Glyphs): string {
  const fillChar = glyphs === ASCII_GLYPHS ? "#" : "█";
  const emptyChar = glyphs === ASCII_GLYPHS ? "-" : "░";
  const filled = Math.round((clamp(score, 0, 100) / 100) * width);
  return `[${fillChar.repeat(filled)}${emptyChar.repeat(width - filled)}]`;
}

function severityGlyph(severity: Severity, styles: Styles, glyphs: Glyphs): string {
  const glyph = glyphs.severity[severity];
  if (severity === "error") return styles.error(glyph);
  if (severity === "warn") return styles.warn(glyph);
  return styles.info(glyph);
}

/** Keeps a fix hint's line inside MAX_LINE_WIDTH regardless of how long a rule's fixPrompt is. */
function truncate(text: string, glyphs: Glyphs): string {
  // "    ↳ fix: " (or ASCII equivalent) prefix already spent before this text.
  const prefixWidth = 4 + glyphs.fixArrow.length + " fix: ".length;
  const budget = MAX_LINE_WIDTH - prefixWidth;
  if (text.length <= budget) {
    return text;
  }
  return `${text.slice(0, budget - glyphs.ellipsis.length)}${glyphs.ellipsis}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
