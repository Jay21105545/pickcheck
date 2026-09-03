import type { TokensRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runTokensTier } from "../../../src/engine/tiers/tokens.js";

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
  it("tokens: produces no findings and a clear not-implemented warning", async () => {
    const result = await runTokensTier(tokensRule, {
      cwd: "/repo",
      scannedFiles: [],
    });

    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining("tokens/context-budget")]);
    expect(result.warnings[0]).toMatch(/not implemented/i);
  });
});
