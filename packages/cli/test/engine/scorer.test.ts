import type { ExistsRule, RegexRule, Rule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { CATEGORY_WEIGHTS, scoreFindings } from "../../src/engine/scorer.js";
import type { Finding } from "../../src/engine/types.js";

function existsRule(overrides: Partial<ExistsRule> = {}): ExistsRule {
  return {
    id: "sec/no-secrets-in-code",
    category: "security",
    severity: "error",
    title: "Hardcoded secret",
    files: ["**/*.ts"],
    message: "A secret looks hardcoded.",
    weight: 4,
    tier: "exists",
    pattern: { mode: "absent" },
    ...overrides,
  };
}

function regexRule(overrides: Partial<RegexRule> = {}): RegexRule {
  return {
    id: "qual/no-console-log",
    category: "quality",
    severity: "warn",
    title: "console.log left in",
    files: ["**/*.ts"],
    message: "console.log left in source.",
    weight: 1,
    tier: "regex",
    pattern: { regex: "console\\.log\\(" },
    ...overrides,
  };
}

function finding(rule: Rule, overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: rule.id,
    file: "src/a.ts",
    severity: rule.severity,
    message: rule.message,
    fixPrompt: "fix it",
    ...overrides,
  };
}

describe("scoreFindings", () => {
  it("scores every category 100 and composite 100 with no rules loaded", () => {
    const result = scoreFindings([], [], ["README.md"]);

    expect(result.composite).toBe(100);
    for (const entry of result.categories) {
      expect(entry.score).toBe(100);
    }
  });

  it("returns every category weight key, matching CATEGORY_WEIGHTS", () => {
    const result = scoreFindings([], [], []);
    expect(result.categories.map((c) => c.category).sort()).toEqual(
      Object.keys(CATEGORY_WEIGHTS).sort(),
    );
  });

  it("applies severity multipliers and rule weight, normalized by applicable rule count", () => {
    const rule = existsRule({ weight: 4, severity: "error" }); // multiplier 2 -> penalty 8
    const result = scoreFindings([finding(rule)], [rule], []);

    const security = result.categories.find((c) => c.category === "security");
    // penalty 8 / 1 applicable rule = 8 -> 100 - 8 = 92
    expect(security?.score).toBe(92);
  });

  it("floors a category score at 0 instead of going negative", () => {
    const rule = existsRule({ weight: 1000, severity: "error" });
    const result = scoreFindings([finding(rule)], [rule], []);

    const security = result.categories.find((c) => c.category === "security");
    expect(security?.score).toBe(0);
  });

  it("computes the composite as the CATEGORY_WEIGHTS-weighted mean", () => {
    const rule = existsRule({ weight: 4, severity: "error" }); // security -> 92
    const result = scoreFindings([finding(rule)], [rule], []);

    const expected = result.categories.reduce(
      (sum, entry) => sum + entry.score * CATEGORY_WEIGHTS[entry.category],
      0,
    );
    expect(result.composite).toBeCloseTo(expected, 6);
    expect(result.composite).toBeCloseTo(92 * 0.3 + 100 * 0.7, 6);
  });

  it("an exists-tier rule is always applicable, even with zero matching files", () => {
    const rule = existsRule({ weight: 10, severity: "warn" }); // multiplier 1 -> penalty 10
    // No scanned files at all — exists tier still applies (absence is the point).
    const result = scoreFindings([finding(rule)], [rule], []);

    const security = result.categories.find((c) => c.category === "security");
    expect(security?.score).toBe(90); // NOT 100 — proves applicableCount stayed 1, not 0
  });

  it("excludes a regex-tier rule from the applicable count when its files glob matches nothing", () => {
    const applicable = regexRule({ id: "qual/rule-a", files: ["**/*.ts"], weight: 2 });
    const notApplicable = regexRule({
      id: "qual/rule-b",
      files: ["**/*.py"],
      weight: 2,
    });

    const onlyApplicable = scoreFindings(
      [finding(applicable)],
      [applicable],
      ["src/a.ts"],
    );
    const withNonApplicableToo = scoreFindings(
      [finding(applicable)],
      [applicable, notApplicable],
      ["src/a.ts"],
    );

    const scoreA = onlyApplicable.categories.find(
      (c) => c.category === "quality",
    )?.score;
    const scoreB = withNonApplicableToo.categories.find(
      (c) => c.category === "quality",
    )?.score;
    expect(scoreB).toBe(scoreA);
  });
});
