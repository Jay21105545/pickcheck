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

  it("accepts a valid tokens rule", () => {
    const result = ruleSchema.safeParse({
      ...base,
      tier: "tokens",
      pattern: { budget: 2000 },
    });
    expect(result.success).toBe(true);
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
