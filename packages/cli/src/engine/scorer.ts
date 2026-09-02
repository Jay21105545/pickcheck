import { matchesAnyGlob } from "./glob.js";
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

/**
 * Points a single finding costs its category, before the rule's own
 * `weight` multiplies it — DECISIONS/0006. Tuned so that, combined with
 * PER_RULE_PENALTY_CAP below and this ruleset's current weights (4-5 for
 * the security rules), a single error-severity finding "visibly wounds"
 * (its rule's penalty exceeds the cap, so the category drops to
 * 100 - PER_RULE_PENALTY_CAP) and a second error from a *different* rule
 * "devastates" it (a second capped penalty stacks on top, usually to 0).
 */
const SEVERITY_POINTS: Record<Severity, number> = {
  info: 4,
  warn: 10,
  error: 25,
};

/**
 * Caps how much penalty any single rule can contribute to its category, no
 * matter how many times it fires — DECISIONS/0006. Without this, one rule
 * firing hundreds of times (e.g. console.log across a large repo) could
 * zero out its category by itself; combined with other rules' findings the
 * category can still reach 0, but no single rule can do that alone.
 */
export const PER_RULE_PENALTY_CAP = 50;

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warn: 1, error: 2 };

/**
 * A gate forces the composite down to `compositeCap` whenever at least one
 * finding in `category` is at `minSeverity` or worse, regardless of what
 * the weighted-mean composite would otherwise compute — DECISIONS/0006.
 * This is a general mechanism: the check below only reads this config, it
 * has no knowledge of which category or severity it's enforcing. Today's
 * only entry happens to be security/error (leaked secrets and tracked
 * .env files can never coexist with a passing default `--min 60` gate),
 * but adding a stricter gate for another category is a data change here,
 * not an engine change.
 */
export interface ScoringGate {
  category: Category;
  minSeverity: Severity;
  compositeCap: number;
}

export const SCORING_GATES: ScoringGate[] = [
  { category: "security", minSeverity: "error", compositeCap: 59 },
];

export interface CategoryScore {
  category: Category;
  score: number;
}

export interface ScoreResult {
  composite: number;
  categories: CategoryScore[];
}

/**
 * DECISIONS/0006 supersedes DECISIONS/0004's formula end to end:
 *
 *   categoryPenalty(category) = sum over rules r with >=1 finding in
 *     category of min(PER_RULE_PENALTY_CAP, sum over r's findings f of
 *     SEVERITY_POINTS[f.severity] * r.weight)
 *   categoryScore(category) = clamp(100 - categoryPenalty(category), 0, 100)
 *
 * No division by rule/applicable count anywhere — ADR 0004's per-category
 * `penalty / applicableCount` diluted every finding further as the ruleset
 * grew, silently inflating scores release over release. A category still
 * *reports* a score of 100 with zero applicable rules (nothing was
 * checked, so nothing is docked) or zero findings (checked and clean),
 * but the composite's weighted mean only includes categories with at
 * least one applicable rule, renormalizing CATEGORY_WEIGHTS over just
 * those. Without that, an empty category (ui-ux and tokens have no rules
 * yet) contributes a free 100 at full nominal weight — inflating today's
 * composite relative to the day rules land there, exactly the kind of
 * ruleset-growth distortion ADR 0004's division caused at the per-category
 * level. Composite is then clamped down further by `gates` (defaults to
 * SCORING_GATES; overridable for tests and, eventually, config).
 */
export function scoreFindings(
  findings: Finding[],
  rules: Rule[],
  scannedFiles: string[],
  gates: ScoringGate[] = SCORING_GATES,
): ScoreResult {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  const categories = CATEGORIES.map((category) => ({
    category,
    score: scoreCategory(category, findings, ruleById),
  }));

  const composite = round(
    applyGates(
      weightedComposite(categories, rules, scannedFiles),
      findings,
      ruleById,
      gates,
    ),
  );

  return { composite, categories };
}

function weightedComposite(
  categories: CategoryScore[],
  rules: Rule[],
  scannedFiles: string[],
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const entry of categories) {
    const hasApplicableRule = rules.some(
      (rule) => rule.category === entry.category && isApplicable(rule, scannedFiles),
    );
    if (!hasApplicableRule) {
      continue;
    }
    const weight = CATEGORY_WEIGHTS[entry.category];
    weightedSum += entry.score * weight;
    totalWeight += weight;
  }

  // No category had an applicable rule at all (e.g. an empty rules dir) —
  // nothing was checked anywhere, so nothing is docked.
  return totalWeight === 0 ? 100 : weightedSum / totalWeight;
}

function applyGates(
  composite: number,
  findings: Finding[],
  ruleById: Map<string, Rule>,
  gates: ScoringGate[],
): number {
  let capped = composite;

  for (const gate of gates) {
    const triggered = findings.some((finding) => {
      const rule = ruleById.get(finding.ruleId);
      return (
        rule?.category === gate.category &&
        SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[gate.minSeverity]
      );
    });
    if (triggered) {
      capped = Math.min(capped, gate.compositeCap);
    }
  }

  return capped;
}

function scoreCategory(
  category: Category,
  findings: Finding[],
  ruleById: Map<string, Rule>,
): number {
  const penaltyByRule = new Map<string, number>();

  for (const finding of findings) {
    const rule = ruleById.get(finding.ruleId);
    if (rule === undefined || rule.category !== category) {
      continue;
    }
    const points = SEVERITY_POINTS[finding.severity] * rule.weight;
    penaltyByRule.set(rule.id, (penaltyByRule.get(rule.id) ?? 0) + points);
  }

  let penalty = 0;
  for (const rulePenalty of penaltyByRule.values()) {
    penalty += Math.min(rulePenalty, PER_RULE_PENALTY_CAP);
  }

  return round(clamp(100 - penalty, 0, 100));
}

function isApplicable(rule: Rule, scannedFiles: string[]): boolean {
  if (rule.tier === "exists") {
    // A conditional exists rule (rule.pattern.when set — see DECISIONS/0005)
    // is only applicable if its precondition matched, same as regex/astgrep
    // below. An unconditional one keeps ADR 0004's "always applicable".
    const when = rule.pattern.when;
    return when === undefined || matchesAnyGlob(scannedFiles, when.files);
  }
  return matchesAnyGlob(scannedFiles, rule.files);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
