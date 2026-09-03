import type { AstgrepRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runAstgrepTier } from "../../../src/engine/tiers/astgrep.js";
import { createTempDir } from "../../helpers/temp-dir.js";

function rule(overrides: Partial<AstgrepRule> = {}): AstgrepRule {
  return {
    id: "qual/no-empty-catch",
    category: "quality",
    severity: "error",
    title: "Empty catch block",
    files: ["**/*.{ts,tsx,js,jsx}"],
    message: "Errors are being silently swallowed.",
    weight: 3,
    tier: "astgrep",
    pattern: {
      rule: {
        kind: "catch_clause",
        has: { kind: "statement_block", regex: "^\\{\\s*\\}$" },
      },
    },
    ...overrides,
  };
}

describe("runAstgrepTier", () => {
  it("finds structural matches with 1-indexed line numbers", async () => {
    const dir = await createTempDir("astgrep-match");
    try {
      await dir.write(
        "src/a.ts",
        "function f() {\n  try {\n    risky();\n  } catch (e) {}\n}\n",
      );

      const result = await runAstgrepTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["src/a.ts"],
      });

      expect(result.warnings).toEqual([]);
      expect(result.findings).toEqual([
        expect.objectContaining({ file: "src/a.ts", line: 4 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("matches a call split across lines — a structural win a regex tier can't replicate", async () => {
    const dir = await createTempDir("astgrep-multiline");
    try {
      await dir.write("src/a.ts", "console\n  .log('split across lines');\n");

      const result = await runAstgrepTier(
        rule({
          id: "disc/no-console-log",
          category: "discipline",
          severity: "warn",
          pattern: { rule: { pattern: "console.log($$$ARGS)" } },
        }),
        { cwd: dir.path, scannedFiles: ["src/a.ts"] },
      );

      expect(result.findings).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });

  it("produces no findings when nothing matches", async () => {
    const dir = await createTempDir("astgrep-no-match");
    try {
      await dir.write(
        "src/a.ts",
        "try {\n  risky();\n} catch (e) {\n  console.error(e);\n}\n",
      );

      const result = await runAstgrepTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["src/a.ts"],
      });

      expect(result).toEqual({ findings: [], warnings: [] });
    } finally {
      await dir.cleanup();
    }
  });

  it("skips files whose extension has no known language mapping, without crashing", async () => {
    const dir = await createTempDir("astgrep-unsupported-ext");
    try {
      await dir.write("src/a.py", "try:\n    risky()\nexcept Exception:\n    pass\n");

      const result = await runAstgrepTier(rule({ files: ["**/*.py"] }), {
        cwd: dir.path,
        scannedFiles: ["src/a.py"],
      });

      expect(result).toEqual({ findings: [], warnings: [] });
    } finally {
      await dir.cleanup();
    }
  });

  it("warns and skips (never crashes) on a malformed pattern", async () => {
    const dir = await createTempDir("astgrep-malformed");
    try {
      await dir.write("src/a.ts", "try {\n  risky();\n} catch (e) {}\n");

      const result = await runAstgrepTier(
        rule({ pattern: { rule: { kind: "not_a_real_tree_sitter_kind" } } }),
        { cwd: dir.path, scannedFiles: ["src/a.ts"] },
      );

      expect(result.findings).toEqual([]);
      expect(result.warnings).toEqual([expect.stringContaining("qual/no-empty-catch")]);
      expect(result.warnings[0]).toMatch(/invalid astgrep pattern/i);
    } finally {
      await dir.cleanup();
    }
  });

  it("short-circuits before touching the filesystem when the files glob matches nothing", async () => {
    const result = await runAstgrepTier(rule({ files: ["**/*.rs"] }), {
      cwd: "/does/not/exist",
      scannedFiles: [],
    });

    expect(result).toEqual({ findings: [], warnings: [] });
  });
});
