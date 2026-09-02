import type { ExistsRule, RegexRule, Rule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_WEIGHTS,
  PER_RULE_PENALTY_CAP,
  SCORING_GATES,
  type ScoringGate,
  scoreFindings,
} from "../../src/engine/scorer.js";
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
    id: "disc/no-console-log",
    category: "discipline",
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
  describe("clean baselines", () => {
    it("scores every category 100 and composite 100 with no rules loaded", () => {
      const result = scoreFindings([], [], ["README.md"]);

      expect(result.composite).toBe(100);
      for (const entry of result.categories) {
        expect(entry.score).toBe(100);
      }
    });

    it("returns every category weight key even when most have no rules", () => {
      const result = scoreFindings([], [], []);
      expect(result.categories.map((c) => c.category).sort()).toEqual(
        Object.keys(CATEGORY_WEIGHTS).sort(),
      );
    });

    // This is also the anchor for "pickcheck's own repo (excluding
    // examples/) scores 85+" (DECISIONS/0006): with .pickcheckignore
    // excluding examples/broken-app, pickcheck's real self-audit has zero
    // findings, which is exactly this case.
    it("scores 100 when rules are loaded and applicable but produce no findings", () => {
      const rule = existsRule({
        files: ["CHANGELOG.md"],
        pattern: { mode: "present" },
      });
      const result = scoreFindings([], [rule], ["CHANGELOG.md"]);
      expect(result.composite).toBe(100);
    });
  });

  describe("per-finding penalty (no applicable-count division)", () => {
    it("costs SEVERITY_POINTS times the rule's weight, capped per rule", () => {
      const rule = existsRule({ weight: 4, severity: "error" }); // 25 * 4 = 100 -> capped at 50
      const result = scoreFindings([finding(rule)], [rule], []);

      const security = result.categories.find((c) => c.category === "security");
      expect(security?.score).toBe(100 - PER_RULE_PENALTY_CAP);
    });

    it("does not dilute an existing finding's penalty as more rules join its category", () => {
      const rule = existsRule({ weight: 1, severity: "warn" }); // 10 * 1 = 10 penalty
      // Two more always-applicable (exists-tier), always-clean decoys.
      const decoyA = existsRule({
        id: "sec/decoy-a",
        files: ["OTHER.md"],
        pattern: { mode: "absent" },
      });
      const decoyB = existsRule({
        id: "sec/decoy-b",
        files: ["OTHER2.md"],
        pattern: { mode: "absent" },
      });

      const withOneRule = scoreFindings([finding(rule)], [rule], []);
      const withThreeRules = scoreFindings([finding(rule)], [rule, decoyA, decoyB], []);

      const s1 = withOneRule.categories.find((c) => c.category === "security")?.score;
      const s3 = withThreeRules.categories.find(
        (c) => c.category === "security",
      )?.score;
      // ADR 0004's formula would have divided the same 10-point penalty by
      // 3 applicable rules instead of 1, silently inflating the score as
      // the ruleset grows. This formula doesn't.
      expect(s1).toBe(90);
      expect(s3).toBe(90);
    });

    it("floors a category score at 0 instead of going negative, even from one huge-weight rule", () => {
      // PER_RULE_PENALTY_CAP means one rule alone can only take a category
      // to 100 - PER_RULE_PENALTY_CAP, never below — see the per-rule cap
      // block below for that. This pins clamp() itself: three separately
      // capped rules (150 raw penalty) still floor at 0, not -50.
      const ruleA = existsRule({ id: "sec/a", weight: 1000, severity: "error" });
      const ruleB = existsRule({ id: "sec/b", weight: 1000, severity: "error" });
      const ruleC = existsRule({ id: "sec/c", weight: 1000, severity: "error" });
      const result = scoreFindings(
        [
          finding(ruleA),
          finding(ruleB, { file: "src/b.ts" }),
          finding(ruleC, { file: "src/c.ts" }),
        ],
        [ruleA, ruleB, ruleC],
        [],
      );

      const security = result.categories.find((c) => c.category === "security");
      expect(security?.score).toBe(0);
    });
  });

  describe("per-rule penalty cap", () => {
    it("caps one rule's total contribution even when it fires hundreds of times", () => {
      const rule = regexRule({ weight: 1, severity: "warn" }); // 10 points per finding
      const findings = Array.from({ length: 200 }, (_, i) =>
        finding(rule, { file: `src/f${i}.ts` }),
      );

      const result = scoreFindings(findings, [rule], ["src/f0.ts"]);

      const discipline = result.categories.find((c) => c.category === "discipline");
      // 200 findings * 10 points = 2000, capped at PER_RULE_PENALTY_CAP —
      // one rule firing everywhere can't zero out its category alone.
      expect(discipline?.score).toBe(100 - PER_RULE_PENALTY_CAP);
    });

    it("still lets two different rules combine past a single rule's cap", () => {
      const ruleA = existsRule({ id: "sec/a", weight: 5, severity: "error" }); // 125 -> capped 50
      const ruleB = existsRule({ id: "sec/b", weight: 4, severity: "error" }); // 100 -> capped 50

      const result = scoreFindings(
        [finding(ruleA), finding(ruleB, { file: "src/b.ts" })],
        [ruleA, ruleB],
        [],
      );

      const security = result.categories.find((c) => c.category === "security");
      expect(security?.score).toBe(0); // 100 - 50 - 50
    });
  });

  describe("composite renormalization over applicable categories", () => {
    it("excludes a category with zero applicable rules from the composite", () => {
      const rule = existsRule({ weight: 5, severity: "warn" }); // 10 * 5 = 50 -> capped 50
      const result = scoreFindings([finding(rule)], [rule], []);

      // security is the only category with any rule at all, so the
      // renormalized composite equals its own score, not a weighted blend
      // diluted by five other categories sitting at a free 100.
      expect(result.composite).toBe(50);
    });

    it("weights the composite by CATEGORY_WEIGHTS ratio across only applicable categories", () => {
      const secRule = existsRule({ weight: 5, severity: "warn" }); // -> security 50
      const docsRule = existsRule({
        id: "docs/changelog-exists",
        category: "docs",
        files: ["CHANGELOG.md"],
        weight: 2,
        severity: "warn",
        pattern: { mode: "present" },
      }); // 10 * 2 = 20 -> docs 80

      const result = scoreFindings(
        [finding(secRule), finding(docsRule, { file: "CHANGELOG.md" })],
        [secRule, docsRule],
        [],
      );

      // security .30 and docs .15 renormalized over their .45 combined
      // weight — the other four categories have no rules and don't count.
      const expected = (50 * 0.3 + 80 * 0.15) / 0.45;
      expect(result.composite).toBeCloseTo(expected, 6);
      expect(result.composite).toBeCloseTo(60, 6);
    });

    it("a rule whose files glob matches nothing keeps its category out of the composite", () => {
      const docsRule = existsRule({
        id: "docs/changelog-exists",
        category: "docs",
        files: ["CHANGELOG.md"],
        weight: 2,
        severity: "warn",
        pattern: { mode: "present" },
      }); // -> docs 80
      const notApplicable = regexRule({ category: "quality", files: ["**/*.py"] });

      const result = scoreFindings(
        [finding(docsRule, { file: "CHANGELOG.md" })],
        [docsRule, notApplicable],
        ["src/a.ts"], // no .py files anywhere
      );

      // If quality were wrongly counted at its nominal .20 weight scoring
      // 100, composite would be (80*.15 + 100*.20) / .35 ≈ 91.43. It isn't
      // applicable here, so docs — the only applicable category — decides
      // the composite alone.
      expect(result.composite).toBe(80);
    });
  });

  describe("conditional exists rule (`pattern.when`) and the composite", () => {
    it("excludes it from the composite when its precondition is unmet", () => {
      const rule = existsRule({
        id: "docs/api-doc-exists",
        category: "docs",
        files: ["API.md"],
        pattern: { mode: "present", when: { files: ["app/api/**"] } },
        weight: 2,
        severity: "warn",
      });
      // No app/api/** anywhere -> the real exists tier never produces a
      // finding here (see tiers/exists.test.ts), so findings is empty.
      const result = scoreFindings([], [rule], ["src/index.ts"]);

      const docs = result.categories.find((c) => c.category === "docs");
      expect(docs?.score).toBe(100);
      expect(result.composite).toBe(100); // vacuous: no category applicable
    });

    it("counts it normally once its precondition matches", () => {
      const rule = existsRule({
        id: "docs/api-doc-exists",
        category: "docs",
        files: ["API.md"],
        pattern: { mode: "present", when: { files: ["app/api/**"] } },
        weight: 2,
        severity: "warn",
      });
      const result = scoreFindings(
        [finding(rule, { file: "API.md" })],
        [rule],
        ["app/api/users/route.ts"],
      );

      const docs = result.categories.find((c) => c.category === "docs");
      expect(docs?.score).toBe(80); // 10 (warn) * 2 (weight) = 20 penalty
      expect(result.composite).toBe(80); // docs is the only applicable category
    });
  });

  describe("gating severity", () => {
    it("caps the composite even though the raw weighted composite would clear the default --min 60 gate", () => {
      const secRule = existsRule({ weight: 1, severity: "error" }); // 25 * 1 = 25 -> security 75
      const result = scoreFindings([finding(secRule)], [secRule], []);

      // security is the only applicable category, so without the gate the
      // composite would be 75 — comfortably above a default --min 60.
      expect(result.composite).toBe(59);
    });

    it("does not cap the composite when no finding meets the gate's severity", () => {
      const secRule = existsRule({ weight: 1, severity: "warn" }); // 10 * 1 = 10 -> security 90
      const result = scoreFindings([finding(secRule)], [secRule], []);
      expect(result.composite).toBe(90);
    });

    it("SCORING_GATES' default config gates security/error at 59", () => {
      expect(SCORING_GATES).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "security",
            minSeverity: "error",
            compositeCap: 59,
          }),
        ]),
      );
    });

    it("is a general mechanism driven entirely by config, not hardcoded to security", () => {
      const docsRule = existsRule({
        id: "docs/changelog-exists",
        category: "docs",
        files: ["CHANGELOG.md"],
        weight: 1,
        severity: "error",
        pattern: { mode: "present" },
      }); // 25 * 1 = 25 -> docs 75
      const customGates: ScoringGate[] = [
        { category: "docs", minSeverity: "error", compositeCap: 40 },
      ];

      const result = scoreFindings(
        [finding(docsRule, { file: "CHANGELOG.md" })],
        [docsRule],
        [],
        customGates,
      );

      // Without a gate, composite would be 75 (docs is the only applicable
      // category). Swapping in a docs-targeted gate caps it at 40 — the
      // exact same code path SCORING_GATES' security entry uses.
      expect(result.composite).toBe(40);
    });
  });

  describe("anchor targets — DECISIONS/0006 recalibration", () => {
    it("a repo shaped like examples/broken-app scores 30-55 composite and fails the default --min 60 gate", () => {
      const envInGit = existsRule({
        id: "sec/no-env-in-git",
        category: "security",
        files: ["**/.env"],
        weight: 5,
        severity: "error",
        pattern: { mode: "absent" },
      });
      const noSecrets = regexRule({
        id: "sec/no-secrets-in-code",
        category: "security",
        files: ["**/*.ts"],
        weight: 4,
        severity: "error",
      });
      const changelog = existsRule({
        id: "docs/changelog-exists",
        category: "docs",
        files: ["CHANGELOG.md"],
        weight: 2,
        severity: "warn",
        pattern: { mode: "present" },
      });
      const apiDoc = existsRule({
        id: "docs/api-doc-exists",
        category: "docs",
        files: ["API.md"],
        weight: 2,
        severity: "warn",
        pattern: { mode: "present", when: { files: ["app/api/**"] } },
      });
      const envExample = existsRule({
        id: "docs/env-example-exists",
        category: "docs",
        files: [".env.example"],
        weight: 2,
        severity: "warn",
        pattern: { mode: "present", when: { files: ["**/.env"] } },
      });
      const consoleLog = regexRule({
        id: "disc/no-console-log",
        category: "discipline",
        files: ["**/*.ts"],
        weight: 1,
        severity: "warn",
      });
      const rules = [envInGit, noSecrets, changelog, apiDoc, envExample, consoleLog];

      const scannedFiles = ["lib/config.ts", "app/api/users/route.ts", ".env"];
      const findings = [
        finding(envInGit, { file: ".env" }),
        finding(noSecrets, { file: "lib/config.ts", line: 3 }),
        finding(changelog, { file: "CHANGELOG.md" }),
        finding(apiDoc, { file: "API.md" }),
        finding(envExample, { file: ".env.example" }),
        finding(consoleLog, { file: "app/api/users/route.ts", line: 6 }),
      ];

      const result = scoreFindings(findings, rules, scannedFiles);

      expect(result.composite).toBeGreaterThanOrEqual(30);
      expect(result.composite).toBeLessThanOrEqual(55);
      expect(result.composite).toBeLessThan(60);
    });
  });
});
