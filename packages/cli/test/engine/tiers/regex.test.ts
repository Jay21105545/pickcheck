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

  it("suppresses all findings in a file when pattern.unless matches anywhere in it", async () => {
    const dir = await createTempDir("regex-unless-suppressed");
    try {
      await dir.write(
        "src/users.ts",
        "import { z } from 'zod';\nconst body = req.body;\n",
      );
      await dir.write("src/other.ts", "const body = req.body;\n");

      const result = await runRegexTier(
        rule({
          pattern: { regex: "req\\.body", unless: { regex: "\\bzod\\b" } },
        }),
        { cwd: dir.path, scannedFiles: ["src/users.ts", "src/other.ts"] },
      );

      expect(result.findings).toEqual([
        expect.objectContaining({ file: "src/other.ts" }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not carry unless-regex state across files when it uses a global flag", async () => {
    const dir = await createTempDir("regex-unless-global-flag");
    try {
      await dir.write("src/a.ts", "import { z } from 'zod';\nconst body = req.body;\n");
      await dir.write("src/b.ts", "import { z } from 'zod';\nconst body = req.body;\n");

      const result = await runRegexTier(
        rule({
          pattern: {
            regex: "req\\.body",
            unless: { regex: "\\bzod\\b", flags: "g" },
          },
        }),
        { cwd: dir.path, scannedFiles: ["src/a.ts", "src/b.ts"] },
      );

      // A stateful global `unless` regex whose lastIndex isn't reset
      // between files would suppress src/a.ts (lastIndex 0) but miss the
      // match on src/b.ts (lastIndex left mid-string), wrongly flagging it.
      expect(result.findings).toEqual([]);
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

  describe("pattern.minCount", () => {
    it("stays quiet below the threshold", async () => {
      const dir = await createTempDir("regex-mincount-under");
      try {
        await dir.write("src/a.ts", "const c = '#fff';\nconst d = '#000';\n");

        const result = await runRegexTier(
          rule({ pattern: { regex: "#[0-9a-fA-F]{3,6}", minCount: 3 } }),
          { cwd: dir.path, scannedFiles: ["src/a.ts"] },
        );

        expect(result).toEqual({ findings: [], warnings: [] });
      } finally {
        await dir.cleanup();
      }
    });

    it("produces exactly one finding, at the threshold-crossing occurrence, once met", async () => {
      const dir = await createTempDir("regex-mincount-over");
      try {
        await dir.write(
          "src/a.ts",
          "const a = '#111';\nconst b = '#222';\nconst c = '#333';\nconst d = '#444';\n",
        );

        const result = await runRegexTier(
          rule({ pattern: { regex: "#[0-9a-fA-F]{3,6}", minCount: 3 } }),
          { cwd: dir.path, scannedFiles: ["src/a.ts"] },
        );

        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]).toMatchObject({ file: "src/a.ts", line: 3 });
        expect(result.findings[0]?.fixPrompt).toMatch(/4 occurrences, threshold 3/);
      } finally {
        await dir.cleanup();
      }
    });

    it("counts occurrences across the whole file, not per line", async () => {
      const dir = await createTempDir("regex-mincount-same-line");
      try {
        await dir.write("src/a.ts", "const pair = ['#111', '#222', '#333'];\n");

        const result = await runRegexTier(
          rule({ pattern: { regex: "#[0-9a-fA-F]{3,6}", minCount: 3 } }),
          { cwd: dir.path, scannedFiles: ["src/a.ts"] },
        );

        expect(result.findings).toHaveLength(1);
      } finally {
        await dir.cleanup();
      }
    });
  });
});
