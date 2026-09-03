import type { TokensRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runTokensTier } from "../../../src/engine/tiers/tokens.js";
import { createTempDir } from "../../helpers/temp-dir.js";

function rule(overrides: Partial<TokensRule> = {}): TokensRule {
  return {
    id: "tok/context-file-budget",
    category: "tokens",
    severity: "warn",
    title: "Context file over budget",
    files: ["CLAUDE.md", "AGENTS.md"],
    message: "Context file exceeds its token budget.",
    weight: 1,
    tier: "tokens",
    pattern: { check: "budget", budget: 20 },
    ...overrides,
  } as TokensRule;
}

describe("runTokensTier — budget check", () => {
  it("flags a file over its token budget", async () => {
    const dir = await createTempDir("tokens-budget-over");
    try {
      await dir.write(
        "CLAUDE.md",
        "word ".repeat(200), // comfortably over a 20-token budget
      );

      const result = await runTokensTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["CLAUDE.md"],
      });

      expect(result.warnings).toEqual([]);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({ file: "CLAUDE.md", severity: "warn" });
      expect(result.findings[0]?.fixPrompt).toMatch(/tokens, budget 20/);
    } finally {
      await dir.cleanup();
    }
  });

  it("stays quiet on a file under its token budget", async () => {
    const dir = await createTempDir("tokens-budget-under");
    try {
      await dir.write("CLAUDE.md", "short file");

      const result = await runTokensTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["CLAUDE.md"],
      });

      expect(result).toEqual({ findings: [], warnings: [] });
    } finally {
      await dir.cleanup();
    }
  });

  it("short-circuits when the files glob matches nothing", async () => {
    const result = await runTokensTier(rule(), {
      cwd: "/does/not/exist",
      scannedFiles: [],
    });
    expect(result).toEqual({ findings: [], warnings: [] });
  });
});

describe("runTokensTier — duplicate check", () => {
  const duplicateRule = (): TokensRule =>
    rule({
      id: "tok/context-duplication",
      pattern: { check: "duplicate", minChars: 20 },
    });

  it("flags a paragraph shared verbatim across two files", async () => {
    const dir = await createTempDir("tokens-duplicate");
    try {
      const shared = "This exact paragraph appears in both context files verbatim.";
      await dir.write("CLAUDE.md", `# Claude\n\n${shared}\n`);
      await dir.write("AGENTS.md", `# Agents\n\n${shared}\n`);

      const result = await runTokensTier(duplicateRule(), {
        cwd: dir.path,
        scannedFiles: ["CLAUDE.md", "AGENTS.md"],
      });

      expect(result.warnings).toEqual([]);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({ file: "CLAUDE.md", line: 3 });
      expect(result.findings[0]?.fixPrompt).toMatch(/duplicated in AGENTS\.md/);
    } finally {
      await dir.cleanup();
    }
  });

  it("stays quiet when files share no paragraph", async () => {
    const dir = await createTempDir("tokens-no-duplicate");
    try {
      await dir.write(
        "CLAUDE.md",
        "# Claude\n\nSomething unique to this file entirely.\n",
      );
      await dir.write(
        "AGENTS.md",
        "# Agents\n\nSomething else, also long enough to count.\n",
      );

      const result = await runTokensTier(duplicateRule(), {
        cwd: dir.path,
        scannedFiles: ["CLAUDE.md", "AGENTS.md"],
      });

      expect(result).toEqual({ findings: [], warnings: [] });
    } finally {
      await dir.cleanup();
    }
  });

  it("stays quiet with only one matched file — nothing to duplicate against", async () => {
    const result = await runTokensTier(duplicateRule(), {
      cwd: "/does/not/exist",
      scannedFiles: ["CLAUDE.md"],
    });
    expect(result).toEqual({ findings: [], warnings: [] });
  });
});

describe("runTokensTier — ignore-coverage check", () => {
  const ignoreCoverageRule = (): TokensRule =>
    rule({
      id: "tok/ai-ignore-coverage",
      files: ["pnpm-lock.yaml"],
      pattern: {
        check: "ignore-coverage",
        ignoreFiles: [".cursorignore", ".claudeignore"],
        requiredPatterns: ["node_modules", "pnpm-lock.yaml"],
      },
    });

  it("flags an artifact that exists on disk and isn't covered by any ignore file", async () => {
    const dir = await createTempDir("tokens-ignore-missing");
    try {
      await dir.write("pnpm-lock.yaml", "lockfile: true\n");

      const result = await runTokensTier(ignoreCoverageRule(), {
        cwd: dir.path,
        scannedFiles: ["pnpm-lock.yaml"],
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({ file: "pnpm-lock.yaml" });
      expect(result.findings[0]?.fixPrompt).toMatch(/no AI-ignore file found/);
    } finally {
      await dir.cleanup();
    }
  });

  it("stays quiet when an existing ignore file covers the present artifact", async () => {
    const dir = await createTempDir("tokens-ignore-covered");
    try {
      await dir.write("pnpm-lock.yaml", "lockfile: true\n");
      await dir.write(".cursorignore", "node_modules\npnpm-lock.yaml\n");

      const result = await runTokensTier(ignoreCoverageRule(), {
        cwd: dir.path,
        scannedFiles: ["pnpm-lock.yaml", ".cursorignore"],
      });

      expect(result).toEqual({ findings: [], warnings: [] });
    } finally {
      await dir.cleanup();
    }
  });

  it("flags only the artifact an ignore file doesn't cover, not one it does", async () => {
    const dir = await createTempDir("tokens-ignore-partial");
    try {
      await dir.write("pnpm-lock.yaml", "lockfile: true\n");
      await dir.write("node_modules/some-pkg/index.js", "module.exports = {};\n");
      // Covers node_modules but not the lockfile.
      await dir.write(".cursorignore", "node_modules\n");

      const result = await runTokensTier(ignoreCoverageRule(), {
        cwd: dir.path,
        scannedFiles: ["pnpm-lock.yaml", ".cursorignore"],
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.file).toBe("pnpm-lock.yaml");
      expect(result.findings[0]?.fixPrompt).toMatch(/not covered by/);
    } finally {
      await dir.cleanup();
    }
  });

  it("stays quiet when a required artifact doesn't exist on disk at all", async () => {
    const dir = await createTempDir("tokens-ignore-absent-artifact");
    try {
      // Neither node_modules nor the lockfile exist yet — nothing to enforce.
      const result = await runTokensTier(
        rule({
          id: "tok/ai-ignore-coverage",
          files: ["pnpm-lock.yaml"],
          pattern: {
            check: "ignore-coverage",
            ignoreFiles: [".cursorignore"],
            requiredPatterns: ["node_modules"],
          },
        }),
        { cwd: dir.path, scannedFiles: [] },
      );

      expect(result).toEqual({ findings: [], warnings: [] });
    } finally {
      await dir.cleanup();
    }
  });
});
