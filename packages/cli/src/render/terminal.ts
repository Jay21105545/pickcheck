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
  green: Styler;
  yellow: Styler;
  red: Styler;
}

const IDENTITY_STYLES: Styles = {
  bold: (s) => s,
  dim: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  red: (s) => s,
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
  green: forcedColors.green,
  yellow: forcedColors.yellow,
  red: forcedColors.red,
};

interface Glyphs {
  topLeft: string;
  bottomLeft: string;
  side: string;
  separator: string;
  dash: string;
}

const UNICODE_GLYPHS: Glyphs = {
  topLeft: "┌─ ",
  bottomLeft: "└─",
  side: "│ ",
  separator: " · ",
  dash: " — ",
};

const ASCII_GLYPHS: Glyphs = {
  topLeft: "+- ",
  bottomLeft: "+-",
  side: "| ",
  separator: " * ",
  dash: " - ",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_WEIGHTS) as Category[];
const SEVERITY_ORDER: Severity[] = ["error", "warn", "info"];
const SEVERITY_LABEL: Record<Severity, string> = {
  error: "ERROR",
  warn: "WARN ",
  info: "INFO ",
};

const BAR_WIDTH = 20;
const GOOD_THRESHOLD = 80;
const OK_THRESHOLD = 60; // matches the audit's default --min

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
      lines.push(
        styles.bold(
          `${category} (${scoreStyle(categoryScore, styles)(String(categoryScore))})`,
        ),
      );

      for (const severity of SEVERITY_ORDER) {
        for (const finding of categoryFindings.filter((f) => f.severity === severity)) {
          const location =
            finding.line === undefined
              ? finding.file
              : `${finding.file}:${finding.line}`;
          lines.push(
            `  ${severityBadge(severity, styles)} ${location}${glyphs.dash}${finding.message}`,
          );
        }
      }
      lines.push("");
    }
  }

  if (result.warnings.length > 0) {
    lines.push(styles.yellow("Warnings:"));
    for (const warning of result.warnings) {
      lines.push(`  ${styles.dim("-")} ${warning}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderSummaryCard(
  result: AuditResult,
  styles: Styles,
  glyphs: Glyphs,
): string[] {
  const composite = result.score.composite;
  const scoreText = scoreStyle(composite, styles)(`${composite}/100`);
  return [
    `${glyphs.topLeft}${styles.bold("pickcheck audit")}`,
    `${glyphs.side}Score  ${scoreBar(composite)} ${scoreText}`,
    `${glyphs.side}${result.rules.length} rules${glyphs.separator}${result.fileCount} files${glyphs.separator}${result.findings.length} findings`,
    glyphs.bottomLeft,
  ];
}

function scoreBar(score: number): string {
  const filled = Math.round((clamp(score, 0, 100) / 100) * BAR_WIDTH);
  return `[${"#".repeat(filled)}${"-".repeat(BAR_WIDTH - filled)}]`;
}

function scoreStyle(score: number, styles: Styles): Styler {
  if (score >= GOOD_THRESHOLD) return styles.green;
  if (score >= OK_THRESHOLD) return styles.yellow;
  return styles.red;
}

function severityBadge(severity: Severity, styles: Styles): string {
  const label = SEVERITY_LABEL[severity];
  if (severity === "error") return styles.red(label);
  if (severity === "warn") return styles.yellow(label);
  return styles.dim(label);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
