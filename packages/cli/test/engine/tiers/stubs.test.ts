import type { AstgrepRule, TokensRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runAstgrepTier } from "../../../src/engine/tiers/astgrep.js";
import { runTokensTier } from "../../../src/engine/tiers/tokens.js";

const astgrepRule: AstgrepRule = {
  id: "qual/no-empty-catch",
  category: "quality",
  severity: "error",
  title: "Empty catch block",
  files: ["**/*.ts"],
  message: "Errors are being silently swallowed.",
  weight: 3,
  tier: "astgrep",
  pattern: { rule: { kind: "catch_clause" } },
};

const tokensRule: TokensRule = {
  id: "tokens/context-budget",
  category: "tokens",
  severity: "warn",
  title: "Context file over budget",
  files: ["CLAUDE.md"],
  message: "Context file exceeds its token budget.",
  weight: 1,
  tier: "tokens",
  pattern: { budget: 2000 },
};

describe("stub tiers", () => {
  it("astgrep: produces no findings and a clear not-implemented warning", async () => {
    const result = await runAstgrepTier(astgrepRule, {
      cwd: "/repo",
      scannedFiles: [],
    });

    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining("qual/no-empty-catch")]);
    expect(result.warnings[0]).toMatch(/not implemented/i);
  });

  it("tokens: produces no findings and a clear not-implemented warning", async () => {
    const result = await runTokensTier(tokensRule, { cwd: "/repo", scannedFiles: [] });

    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining("tokens/context-budget")]);
    expect(result.warnings[0]).toMatch(/not implemented/i);
  });
});
