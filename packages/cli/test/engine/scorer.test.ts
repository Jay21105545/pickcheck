import type { ExistsRule, RegexRule, Rule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_SCORE_K,
  CATEGORY_WEIGHTS,
  PER_RULE_PENALTY_CAP,
  SCORING_GATES,
  type ScoringGate,
  scoreFindings,
} from "../../src/engine/scorer.js";
import type { Finding } from "../../src/engine/types.js";

/** categoryScore(penalty) per DECISIONS/0009, mirroring scorer.ts exactly. */
function curve(penalty: number): number {
  return (
    Math.round(((100 * CATEGORY_SCORE_K) / (CATEGORY_SCORE_K + penalty)) * 100) / 100
  );
}

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
    it("costs SEVERITY_POINTS times the rule's weight, capped per rule — single-secret anchor", () => {
      const rule = existsRule({ weight: 4, severity: "error" }); // 25 * 4 = 100 -> capped at 50
      const result = scoreFindings([finding(rule)], [rule], []);

      const security = result.categories.find((c) => c.category === "security");
      // DECISIONS/0009: a single rule capped at PER_RULE_PENALTY_CAP lands
      // the category at exactly half — curve(PER_RULE_PENALTY_CAP) — the
      // same anchor value ADR 0006's linear formula produced (100 -
      // PER_RULE_PENALTY_CAP = 50 too), by construction of
      // CATEGORY_SCORE_K = PER_RULE_PENALTY_CAP.
      expect(security?.score).toBe(curve(PER_RULE_PENALTY_CAP));
      expect(security?.score).toBe(50);
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
      expect(s1).toBe(curve(10));
      expect(s3).toBe(curve(10));
    });

    it("keeps discriminating past two capped rules instead of flooring at 0 (DECISIONS/0009)", () => {
      // ADR 0006's linear formula floored this at exactly 0: three
      // separately capped rules (150 raw penalty) all exceeded the
      // category's fixed 100-point budget, and every further finding
      // beyond the second rule was invisible. The hyperbola never fully
      // saturates for finite input — three capped rules score lower than
      // two, which score lower than one, all the way down.
      const ruleA = existsRule({ id: "sec/a", weight: 1000, severity: "error" });
      const ruleB = existsRule({ id: "sec/b", weight: 1000, severity: "error" });
      const ruleC = existsRule({ id: "sec/c", weight: 1000, severity: "error" });
      const oneRule = scoreFindings([finding(ruleA)], [ruleA], []);
      const twoRules = scoreFindings(
        [finding(ruleA), finding(ruleB, { file: "src/b.ts" })],
        [ruleA, ruleB],
        [],
      );
      const threeRules = scoreFindings(
        [
          finding(ruleA),
          finding(ruleB, { file: "src/b.ts" }),
          finding(ruleC, { file: "src/c.ts" }),
        ],
        [ruleA, ruleB, ruleC],
        [],
      );

      const scoreOf = (r: typeof oneRule) =>
        r.categories.find((c) => c.category === "security")?.score;

      expect(scoreOf(oneRule)).toBe(curve(PER_RULE_PENALTY_CAP)); // 50
      expect(scoreOf(twoRules)).toBe(curve(2 * PER_RULE_PENALTY_CAP)); // 33.33
      expect(scoreOf(threeRules)).toBe(curve(3 * PER_RULE_PENALTY_CAP)); // 25
      expect(scoreOf(oneRule)).toBeGreaterThan(scoreOf(twoRules) ?? 0);
      expect(scoreOf(twoRules)).toBeGreaterThan(scoreOf(threeRules) ?? 0);
      // Never a hard floor, no matter how many rules pile on.
      expect(scoreOf(threeRules)).toBeGreaterThan(0);
    });
  });

  describe("per-rule penalty cap", () => {
    it("caps one rule's total contribution even when it fires hundreds of times — still can't zero a category alone", () => {
      const rule = regexRule({ weight: 1, severity: "warn" }); // 10 points per finding
      const findings = Array.from({ length: 200 }, (_, i) =>
        finding(rule, { file: `src/f${i}.ts` }),
      );

      const result = scoreFindings(findings, [rule], ["src/f0.ts"]);

      const discipline = result.categories.find((c) => c.category === "discipline");
      // 200 findings * 10 points = 2000, capped at PER_RULE_PENALTY_CAP —
      // one rule firing everywhere can't zero out its category alone,
      // under DECISIONS/0009's curve exactly as it couldn't under 0006's
      // linear formula (both land on the same anchor: curve(cap) = 50).
      expect(discipline?.score).toBe(curve(PER_RULE_PENALTY_CAP));
      expect(discipline?.score).toBeGreaterThan(0);
    });

    it("lets two different rules combine past a single rule's cap, but no longer to exactly 0", () => {
      const ruleA = existsRule({ id: "sec/a", weight: 5, severity: "error" }); // 125 -> capped 50
      const ruleB = existsRule({ id: "sec/b", weight: 4, severity: "error" }); // 100 -> capped 50

      const result = scoreFindings(
        [finding(ruleA), finding(ruleB, { file: "src/b.ts" })],
        [ruleA, ruleB],
        [],
      );

      const security = result.categories.find((c) => c.category === "security");
      // DECISIONS/0006 landed this at exactly 0 (100 - 50 - 50). 0009's
      // curve keeps it discriminable: curve(50 + 50) = 33.33, not 0.
      expect(security?.score).toBe(curve(2 * PER_RULE_PENALTY_CAP));
      expect(security?.score).toBeGreaterThan(0);
    });
  });

  describe("composite renormalization over applicable categories", () => {
    it("excludes a category with zero applicable rules from the composite", () => {
      const rule = existsRule({ weight: 5, severity: "warn" }); // 10 * 5 = 50 -> capped 50
      const result = scoreFindings([finding(rule)], [rule], []);

      // security is the only category with any rule at all, so the
      // renormalized composite equals its own score, not a weighted blend
      // diluted by five other categories sitting at a free 100. Penalty
      // sits exactly at PER_RULE_PENALTY_CAP, so curve(50) = 50 — same
      // value ADR 0006's linear formula gave for this exact case.
      expect(result.composite).toBe(curve(50));
      expect(result.composite).toBe(50);
    });

    it("weights the composite by CATEGORY_WEIGHTS ratio across only applicable categories", () => {
      const secRule = existsRule({ weight: 5, severity: "warn" }); // 50 penalty -> security curve(50)=50
      const docsRule = existsRule({
        id: "docs/changelog-exists",
        category: "docs",
        files: ["CHANGELOG.md"],
        weight: 2,
        severity: "warn",
        pattern: { mode: "present" },
      }); // 10 * 2 = 20 penalty -> docs curve(20)

      const result = scoreFindings(
        [finding(secRule), finding(docsRule, { file: "CHANGELOG.md" })],
        [secRule, docsRule],
        [],
      );

      // security .30 and docs .15 renormalized over their .45 combined
      // weight — the other four categories have no rules and don't count.
      // Uses the already-rounded per-category scores, same as the real
      // composite computation does; the final composite is itself rounded
      // to 2dp too, so the tolerance matches that, not float precision.
      const expected = (curve(50) * 0.3 + curve(20) * 0.15) / 0.45;
      expect(result.composite).toBeCloseTo(expected, 2);
      expect(result.composite).toBeCloseTo(57.14, 2);
    });

    it("a rule whose files glob matches nothing keeps its category out of the composite", () => {
      const docsRule = existsRule({
        id: "docs/changelog-exists",
        category: "docs",
        files: ["CHANGELOG.md"],
        weight: 2,
        severity: "warn",
        pattern: { mode: "present" },
      }); // 20 penalty -> docs curve(20)
      const notApplicable = regexRule({ category: "quality", files: ["**/*.py"] });

      const result = scoreFindings(
        [finding(docsRule, { file: "CHANGELOG.md" })],
        [docsRule, notApplicable],
        ["src/a.ts"], // no .py files anywhere
      );

      // If quality were wrongly counted at its nominal .20 weight scoring
      // 100, composite would be higher. It isn't applicable here, so docs
      // — the only applicable category — decides the composite alone.
      expect(result.composite).toBe(curve(20));
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
      expect(docs?.score).toBe(curve(20)); // 10 (warn) * 2 (weight) = 20 penalty
      expect(result.composite).toBe(curve(20)); // docs is the only applicable category
    });
  });

  describe("gating severity", () => {
    it("caps the composite even though the raw weighted composite would clear the default --min 60 gate", () => {
      const secRule = existsRule({ weight: 1, severity: "error" }); // 25 * 1 = 25 penalty -> security curve(25)=66.67
      const result = scoreFindings([finding(secRule)], [secRule], []);

      // security is the only applicable category, so without the gate the
      // composite would be curve(25) ≈ 66.67 — comfortably above a
      // default --min 60. The gate is a ceiling (min), not a fixed value
      // — see the "gate is a ceiling, not a fixed value" tests below for
      // that distinction made explicit.
      expect(result.composite).toBe(59);
    });

    it("does not cap the composite when no finding meets the gate's severity", () => {
      const secRule = existsRule({ weight: 1, severity: "warn" }); // 10 * 1 = 10 penalty -> security curve(10)
      const result = scoreFindings([finding(secRule)], [secRule], []);
      expect(result.composite).toBe(curve(10));
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
      }); // 25 * 1 = 25 penalty -> docs curve(25)=66.67
      const customGates: ScoringGate[] = [
        { category: "docs", minSeverity: "error", compositeCap: 40 },
      ];

      const result = scoreFindings(
        [finding(docsRule, { file: "CHANGELOG.md" })],
        [docsRule],
        [],
        customGates,
      );

      // Without a gate, composite would be curve(25) ≈ 66.67 (docs is the
      // only applicable category). Swapping in a docs-targeted gate caps
      // it at 40 — the exact same code path SCORING_GATES' security entry
      // uses.
      expect(result.composite).toBe(40);
    });

    it("single-secret anchor: security=50, composite gated to 59, matching the real ruleset (DECISIONS/0009)", () => {
      // One real security error (weight 4, e.g. a hardcoded secret),
      // otherwise-clean-but-applicable quality/docs/discipline (an
      // unconditional exists-tier decoy per category, matching nothing in
      // scannedFiles, so each is applicable and scores 100). This is the
      // shape that makes the gate's job visible: security alone would
      // read as "half wounded" (50), but security .30 + three clean
      // categories at 100 blends to a pre-gate composite of 81.25 — high
      // enough to read as "passing" to a human skimming it, which is
      // exactly why the gate exists.
      const secRule = existsRule({ weight: 4, severity: "error" }); // 100 -> capped 50 -> curve(50)=50
      const qualityDecoy = existsRule({
        id: "qual/decoy",
        category: "quality",
        files: ["NEVER.md"],
        pattern: { mode: "absent" },
      });
      const docsDecoy = existsRule({
        id: "docs/decoy",
        category: "docs",
        files: ["NEVER2.md"],
        pattern: { mode: "absent" },
      });
      const disciplineDecoy = existsRule({
        id: "disc/decoy",
        category: "discipline",
        files: ["NEVER3.md"],
        pattern: { mode: "absent" },
      });

      const result = scoreFindings(
        [finding(secRule)],
        [secRule, qualityDecoy, docsDecoy, disciplineDecoy],
        [],
      );

      const security = result.categories.find((c) => c.category === "security");
      expect(security?.score).toBe(50);
      // Pre-gate: (50*.3 + 100*.2 + 100*.15 + 100*.15) / .8 = 81.25
      expect(result.composite).toBe(59);
    });

    it("gate is a ceiling, not a fixed value: it never raises a composite that's already below the cap", () => {
      // Security-only ruleset (no other applicable category to blend in a
      // clean 100) — three distinct capped error rules land the composite
      // at curve(150) = 25, comfortably under the gate's compositeCap
      // (59), entirely from the category math, before the gate runs at
      // all. If the gate were a flat "set composite = compositeCap on
      // trigger" instead of min(composite, compositeCap), this would
      // wrongly come back as 59.
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

      expect(result.composite).toBe(curve(3 * PER_RULE_PENALTY_CAP)); // 25
      expect(result.composite).toBeLessThan(59);
    });
  });

  describe("anchor targets — DECISIONS/0006 weights & gate, DECISIONS/0009 curve", () => {
    it("a repo shaped like the original (six-rule) examples/broken-app still scores 30-55 and fails the default gate", () => {
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

    it("a repo shaped like the current (ten-rule) examples/broken-app scores in a sensible band and still fails the default gate", () => {
      const envInGit = existsRule({
        id: "sec/no-env-in-git",
        category: "security",
        files: ["**/.env"],
        weight: 5,
        severity: "error",
        pattern: { mode: "absent" },
      });
      const noHallucinatedImports = regexRule({
        id: "sec/no-hallucinated-imports",
        category: "security",
        files: ["**/*.ts"],
        weight: 4,
        severity: "error",
      });
      const noSecrets = regexRule({
        id: "sec/no-secrets-in-code",
        category: "security",
        files: ["**/*.ts"],
        weight: 4,
        severity: "error",
      });
      const postHasValidation = regexRule({
        id: "sec/post-has-validation",
        category: "security",
        files: ["app/api/**/*.ts"],
        weight: 2,
        severity: "warn",
      });
      const noEmptyCatch = regexRule({
        id: "qual/no-empty-catch",
        category: "quality",
        files: ["**/*.ts"],
        weight: 3,
        severity: "error",
      });
      const fetchHasErrorHandling = regexRule({
        id: "qual/fetch-has-error-handling",
        category: "quality",
        files: ["**/*.ts"],
        weight: 2,
        severity: "warn",
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
      const rules = [
        envInGit,
        noHallucinatedImports,
        noSecrets,
        postHasValidation,
        noEmptyCatch,
        fetchHasErrorHandling,
        changelog,
        apiDoc,
        envExample,
        consoleLog,
      ];

      const scannedFiles = [
        "lib/config.ts",
        "lib/analytics.ts",
        "lib/api-client.ts",
        "app/api/users/route.ts",
        ".env",
      ];
      const findings = [
        finding(envInGit, { file: ".env" }),
        finding(noHallucinatedImports, { file: "lib/analytics.ts", line: 1 }),
        finding(noSecrets, { file: "lib/config.ts", line: 3 }),
        finding(postHasValidation, { file: "app/api/users/route.ts", line: 11 }),
        finding(noEmptyCatch, { file: "lib/api-client.ts", line: 9 }),
        finding(fetchHasErrorHandling, { file: "lib/api-client.ts", line: 2 }),
        finding(changelog, { file: "CHANGELOG.md" }),
        finding(apiDoc, { file: "API.md" }),
        finding(envExample, { file: ".env.example" }),
        finding(consoleLog, { file: "app/api/users/route.ts", line: 6 }),
      ];

      const result = scoreFindings(findings, rules, scannedFiles);

      // security: 3 capped-50 error rules + 1 uncapped warn (20) -> curve(170) ≈ 22.73
      // quality: 1 capped-50 error + 1 uncapped warn (20) -> curve(70) ≈ 41.67
      // docs: 3 uncapped warns (20 each) -> curve(60) ≈ 45.45
      // discipline: 1 uncapped warn (10) -> curve(10) ≈ 83.33
      expect(result.composite).toBeGreaterThanOrEqual(38);
      expect(result.composite).toBeLessThanOrEqual(48);
      expect(result.composite).toBeLessThan(60);
      // Went from 6 findings across 3 categories (flooring security at 0
      // under DECISIONS/0006) to 10 findings across 4 categories. Under
      // 0006's linear formula this scored *lower* despite security no
      // longer being able to hide behind a hard floor — 0009 lets the
      // extra findings register instead of vanishing into an
      // already-zeroed category.
    });
  });
});
