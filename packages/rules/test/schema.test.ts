import { describe, expect, it } from "vitest";
import { ruleSchema } from "../schema.js";

const base = {
  id: "sec/no-secrets-in-code",
  category: "security",
  severity: "error",
  title: "Hardcoded secret",
  files: ["**/*.ts"],
  message: "A secret looks hardcoded.",
  weight: 3,
};

describe("ruleSchema", () => {
  it("accepts a valid exists rule", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "exists",
      pattern: { mode: "absent" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid regex rule", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "regex",
      pattern: { regex: "console\\.log\\(" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid astgrep rule with an opaque pattern payload", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "astgrep",
      pattern: { rule: { kind: "catch_clause" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid tokens rule (budget check)", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "tokens",
      pattern: { check: "budget", budget: 2000 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid tokens rule (duplicate check) and defaults minChars", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "tokens",
      pattern: { check: "duplicate" },
    });
    expect(result.success).toBe(true);
    if (
      result.success &&
      result.data.tier === "tokens" &&
      result.data.pattern.check === "duplicate"
    ) {
      expect(result.data.pattern.minChars).toBe(200);
    }
  });

  it("accepts a valid tokens rule (ignore-coverage check)", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "tokens",
      pattern: {
        check: "ignore-coverage",
        ignoreFiles: [".cursorignore"],
        requiredPatterns: ["node_modules"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a tokens rule with an unknown check discriminant", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "tokens",
      pattern: { check: "unknown-check" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid manifest rule and defaults manifestFile to package.json", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "manifest",
      pattern: {
        regex: "from\\s+['\"]([^'\"]+)['\"]",
        dependencyFields: ["dependencies", "devDependencies"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.tier === "manifest") {
      expect(result.data.pattern.manifestFile).toBe("package.json");
    }
  });

  it("rejects a manifest rule missing dependencyFields", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "manifest",
      pattern: { regex: "from\\s+['\"]([^'\"]+)['\"]" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an id that isn't category/rule-id shaped", () => {
    const result = ruleSchema.safeParse({
      ...base,
      id: "no-secrets-in-code",
      tier: "exists",
      pattern: { mode: "absent" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = ruleSchema.safeParse({
      ...base,
      category: "performance",
      tier: "exists",
      pattern: { mode: "absent" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a regex rule with a pattern.unless suppression", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "regex",
      pattern: { regex: "req\\.body", unless: { regex: "\\bzod\\b" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a regex rule missing its pattern.regex field", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "regex",
      pattern: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an exists rule with a regex-shaped pattern (tier/pattern mismatch)", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "exists",
      pattern: { regex: "console\\.log\\(" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a regex rule carrying an astgrep-shaped pattern (tier/pattern mismatch)", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "regex",
      // An astgrep pattern has no `regex` field, which regexRuleSchema requires.
      pattern: { rule: { kind: "catch_clause" } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts an exists rule with a conditional `when` precondition", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "exists",
      pattern: { mode: "present", when: { files: ["app/api/**"] } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an exists rule whose `when.files` is empty", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "exists",
      pattern: { mode: "present", when: { files: [] } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative weight", () => {
    const result = ruleSchema.safeParse({
      ...base,
      weight: -1,
      tier: "exists",
      pattern: { mode: "absent" },
    });
    expect(result.success).toBe(false);
  });
});
