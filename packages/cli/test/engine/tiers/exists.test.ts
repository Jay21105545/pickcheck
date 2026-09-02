import type { ExistsRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runExistsTier } from "../../../src/engine/tiers/exists.js";

function rule(overrides: Partial<ExistsRule> = {}): ExistsRule {
  return {
    id: "docs/changelog-exists",
    category: "docs",
    severity: "warn",
    title: "CHANGELOG missing",
    files: ["CHANGELOG.md"],
    message: "No CHANGELOG.md found.",
    weight: 2,
    tier: "exists",
    pattern: { mode: "present" },
    ...overrides,
  };
}

describe("runExistsTier", () => {
  it("mode: present — no finding when a matching file exists", async () => {
    const result = await runExistsTier(rule(), {
      cwd: "/repo",
      scannedFiles: ["CHANGELOG.md", "README.md"],
    });

    expect(result).toEqual({ findings: [], warnings: [] });
  });

  it("mode: present — one finding against the expected path when nothing matches", async () => {
    const result = await runExistsTier(rule(), {
      cwd: "/repo",
      scannedFiles: ["README.md"],
    });

    expect(result.warnings).toEqual([]);
    expect(result.findings).toEqual([
      {
        ruleId: "docs/changelog-exists",
        file: "CHANGELOG.md",
        severity: "warn",
        message: "No CHANGELOG.md found.",
        fixPrompt: expect.stringContaining("CHANGELOG.md"),
      },
    ]);
  });

  it("mode: absent — a finding per matching file", async () => {
    const result = await runExistsTier(
      rule({
        id: "sec/no-env-in-git",
        files: ["**/.env"],
        pattern: { mode: "absent" },
      }),
      { cwd: "/repo", scannedFiles: [".env", "packages/api/.env", "README.md"] },
    );

    expect(result.warnings).toEqual([]);
    expect(result.findings.map((f) => f.file).sort()).toEqual([
      ".env",
      "packages/api/.env",
    ]);
  });

  it("mode: absent — no findings when nothing matches", async () => {
    const result = await runExistsTier(
      rule({ files: ["**/.env"], pattern: { mode: "absent" } }),
      { cwd: "/repo", scannedFiles: ["README.md"] },
    );

    expect(result).toEqual({ findings: [], warnings: [] });
  });
});
