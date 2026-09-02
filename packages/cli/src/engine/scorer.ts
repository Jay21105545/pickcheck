import micromatch from "micromatch";
import type { Category, Finding, Rule, Severity } from "./types.js";

/** ARCHITECTURE.md's composite weighting. Change only via a decision record. */
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  security: 0.3,
  quality: 0.2,
  docs: 0.15,
  discipline: 0.15,
  "ui-ux": 0.1,
  tokens: 0.1,
};

const CATEGORIES = Object.keys(CATEGORY_WEIGHTS) as Category[];

const SEVERITY_MULTIPLIERS: Record<Severity, number> = {
  info: 0.5,
  warn: 1,
  error: 2,
};

export interface CategoryScore {
  category: Category;
  score: number;
}

export interface ScoreResult {
  composite: number;
  categories: CategoryScore[];
}

/**
 * Category score = 100 - sum(finding.weight * severityMultiplier), floor 0,
 * normalized by how many rules in that category actually applied to this
 * repo — ARCHITECTURE.md names this normalization but doesn't pin an exact
 * denominator. Here, "applicable" means the check was meaningful for this
 * repo: an unconditional `exists` rule always applies (that's the point of
 * it — absence IS the finding), a *conditional* `exists` rule (pattern.when
 * set, see DECISIONS/0005) applies only if its precondition matched, and
 * regex/astgrep/tokens rules apply only if their `files` glob matched at
 * least one scanned file. A category with zero applicable rules scores 100
 * — nothing was checked, so nothing is docked.
 * Composite = weighted mean of category scores via CATEGORY_WEIGHTS.
 */
export function scoreFindings(
  findings: Finding[],
  rules: Rule[],
  scannedFiles: string[],
): ScoreResult {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  const categories = CATEGORIES.map((category) => ({
    category,
    score: scoreCategory(category, findings, rules, ruleById, scannedFiles),
  }));

  const composite = round(
    categories.reduce(
      (sum, entry) => sum + entry.score * CATEGORY_WEIGHTS[entry.category],
      0,
    ),
  );

  return { composite, categories };
}

function scoreCategory(
  category: Category,
  findings: Finding[],
  rules: Rule[],
  ruleById: Map<string, Rule>,
  scannedFiles: string[],
): number {
  const applicableCount = rules.filter(
    (rule) => rule.category === category && isApplicable(rule, scannedFiles),
  ).length;

  if (applicableCount === 0) {
    return 100;
  }

  const penalty = findings.reduce((sum, finding) => {
    const rule = ruleById.get(finding.ruleId);
    if (rule === undefined || rule.category !== category) {
      return sum;
    }
    return sum + rule.weight * SEVERITY_MULTIPLIERS[finding.severity];
  }, 0);

  return round(clamp(100 - penalty / applicableCount, 0, 100));
}

function isApplicable(rule: Rule, scannedFiles: string[]): boolean {
  // dot: true — scannedFiles includes dotfiles (see scan.ts); without it
  // micromatch's `**` won't match a dotfile segment, either as a positive
  // match or under a `!` exclusion pattern.
  if (rule.tier === "exists") {
    // A conditional exists rule (rule.pattern.when set — see DECISIONS/0005)
    // is only applicable if its precondition matched, same as regex/astgrep
    // below. An unconditional one keeps ADR 0004's "always applicable".
    const when = rule.pattern.when;
    return (
      when === undefined || micromatch.some(scannedFiles, when.files, { dot: true })
    );
  }
  return micromatch.some(scannedFiles, rule.files, { dot: true });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
