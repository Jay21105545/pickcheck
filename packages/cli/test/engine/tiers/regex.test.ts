import type { RegexRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runRegexTier } from "../../../src/engine/tiers/regex.js";
import { createTempDir } from "../../helpers/temp-dir.js";

function rule(overrides: Partial<RegexRule> = {}): RegexRule {
  return {
    id: "disc/no-console-log",
    category: "discipline",
    severity: "info",
    title: "console.log left in",
    files: ["**/*.ts"],
    message: "console.log left in source.",
    weight: 1,
    tier: "regex",
    pattern: { regex: "console\\.log\\(" },
    ...overrides,
  };
}

describe("runRegexTier", () => {
  it("reports one finding per matching line, with 1-indexed line numbers", async () => {
    const dir = await createTempDir("regex-lines");
    try {
      await dir.write(
        "src/a.ts",
        "const x = 1;\nconsole.log(x);\nconst y = 2;\nconsole.log(y);\n",
      );

      const result = await runRegexTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["src/a.ts"],
      });

      expect(result.warnings).toEqual([]);
      expect(result.findings).toEqual([
        expect.objectContaining({ file: "src/a.ts", line: 2 }),
        expect.objectContaining({ file: "src/a.ts", line: 4 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("only checks files matching the rule's files glob (path scoping)", async () => {
    const dir = await createTempDir("regex-scoping");
    try {
      await dir.write("src/a.ts", "console.log('ts');\n");
      await dir.write(
        "src/a.py",
        "print('py has no console.log')\nconsole.log('but this line does')\n",
      );

      const result = await runRegexTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["src/a.ts", "src/a.py"],
      });

      expect(result.findings.map((f) => f.file)).toEqual(["src/a.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("produces no findings when nothing matches", async () => {
    const dir = await createTempDir("regex-no-match");
    try {
      await dir.write("src/a.ts", "const x = 1;\n");

      const result = await runRegexTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["src/a.ts"],
      });

      expect(result).toEqual({ findings: [], warnings: [] });
    } finally {
      await dir.cleanup();
    }
  });

  it("does not carry regex state across lines when the rule uses a global flag", async () => {
    const dir = await createTempDir("regex-global-flag");
    try {
      await dir.write(
        "src/a.ts",
        "console.log(1);\nconsole.log(2);\nconsole.log(3);\n",
      );

      const result = await runRegexTier(
        rule({ pattern: { regex: "console\\.log\\(", flags: "g" } }),
        {
          cwd: dir.path,
          scannedFiles: ["src/a.ts"],
        },
      );

      // A stateful global regex whose lastIndex isn't reset between .test()
      // calls skips every other match — this pins that it doesn't.
      expect(result.findings).toHaveLength(3);
    } finally {
      await dir.cleanup();
    }
  });
});
