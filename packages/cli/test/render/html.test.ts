import { describe, expect, it } from "vitest";
import type { AuditResult } from "../../src/engine/audit.js";
import type { HistoryEntry } from "../../src/engine/history.js";
import { computeRulesetFingerprint } from "../../src/engine/history.js";
import type { Rule } from "../../src/engine/types.js";
import { buildReportHtml } from "../../src/render/html.js";
import { createTempDir } from "../helpers/temp-dir.js";

const secretRule: Rule = {
  id: "sec/no-secrets-in-code",
  category: "security",
  severity: "error",
  title: "Hardcoded secret",
  files: ["**/*.ts"],
  message: "A secret looks hardcoded.",
  weight: 4,
  tier: "exists",
  pattern: { mode: "absent" },
};

function baseAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    rules: [secretRule],
    findings: [],
    score: {
      composite: 88.5,
      categories: [
        { category: "security", score: 92 },
        { category: "quality", score: 100 },
        { category: "docs", score: 100 },
        { category: "discipline", score: 100 },
        { category: "ui-ux", score: 100 },
        { category: "tokens", score: 100 },
      ],
    },
    warnings: [],
    fileCount: 3,
    tokenSurface: undefined,
    ...overrides,
  };
}

describe("buildReportHtml", () => {
  it("resolves rule metadata and reads a real code snippet from disk", async () => {
    const repo = await createTempDir("html-adapter-snippet");
    try {
      await repo.write(
        "src/config.ts",
        ["const a = 1;", "const secret = 'sk_live_abc123';", "const b = 2;"].join("\n"),
      );

      const result = baseAuditResult({
        findings: [
          {
            ruleId: "sec/no-secrets-in-code",
            file: "src/config.ts",
            line: 2,
            severity: "error",
            message: "A secret looks hardcoded.",
            fixPrompt: "Fix it.",
          },
        ],
      });

      const html = await buildReportHtml(result, {
        cwd: repo.path,
        repoName: "demo-repo",
        generatedAt: new Date("2026-09-03T12:00:00.000Z"),
        history: [],
      });

      expect(html).toContain("demo-repo");
      expect(html).toContain("Hardcoded secret");
      expect(html).toContain("src/config.ts:2");
      expect(html).toContain("sk_live_abc123"); // escaped, but the text must be present
    } finally {
      await repo.cleanup();
    }
  });

  it("skips a finding whose rule can't be resolved, with a warning instead of crashing", async () => {
    const repo = await createTempDir("html-adapter-unknown-rule");
    try {
      const result = baseAuditResult({
        findings: [
          {
            ruleId: "made-up/rule",
            file: "src/a.ts",
            severity: "warn",
            message: "n/a",
            fixPrompt: "n/a",
          },
        ],
      });

      const html = await buildReportHtml(result, {
        cwd: repo.path,
        repoName: "demo-repo",
        generatedAt: new Date("2026-09-03T12:00:00.000Z"),
        history: [],
      });

      expect(html).toContain(
        "finding for unknown rule &quot;made-up/rule&quot; — skipped",
      );
      expect(html).toContain("No findings. Every checked rule passed.");
    } finally {
      await repo.cleanup();
    }
  });

  it("shows no previous-run comparison on a repo's first audit", async () => {
    const repo = await createTempDir("html-adapter-first-run");
    try {
      const result = baseAuditResult();
      const html = await buildReportHtml(result, {
        cwd: repo.path,
        repoName: "demo-repo",
        generatedAt: new Date("2026-09-03T12:00:00.000Z"),
        history: [],
      });
      expect(html).toContain("First recorded run");
    } finally {
      await repo.cleanup();
    }
  });

  it("flags a ruleset change between the previous run and this one", async () => {
    const repo = await createTempDir("html-adapter-ruleset-change");
    try {
      const result = baseAuditResult();
      const previous: HistoryEntry = {
        timestamp: "2026-09-01T00:00:00.000Z",
        composite: 70,
        categories: result.score.categories,
        findingCount: 0,
        rulesetVersion: "stale-fingerprint",
      };

      const html = await buildReportHtml(result, {
        cwd: repo.path,
        repoName: "demo-repo",
        generatedAt: new Date("2026-09-03T12:00:00.000Z"),
        history: [previous],
      });

      expect(html).toContain("70 → 88.5 since last run");
      expect(html).toContain("ruleset changed since last run");
      expect(previous.rulesetVersion).not.toBe(computeRulesetFingerprint(result.rules));
    } finally {
      await repo.cleanup();
    }
  });

  it("does not flag a ruleset change when the fingerprint matches", async () => {
    const repo = await createTempDir("html-adapter-same-ruleset");
    try {
      const result = baseAuditResult();
      const previous: HistoryEntry = {
        timestamp: "2026-09-01T00:00:00.000Z",
        composite: 70,
        categories: result.score.categories,
        findingCount: 0,
        rulesetVersion: computeRulesetFingerprint(result.rules),
      };

      const html = await buildReportHtml(result, {
        cwd: repo.path,
        repoName: "demo-repo",
        generatedAt: new Date("2026-09-03T12:00:00.000Z"),
        history: [previous],
      });

      expect(html).not.toContain("ruleset changed since last run");
    } finally {
      await repo.cleanup();
    }
  });

  it("adapts the token surface report, including uncovered AI-ignore artifacts", async () => {
    const repo = await createTempDir("html-adapter-token-surface");
    try {
      const result = baseAuditResult({
        tokenSurface: {
          files: [{ file: "CLAUDE.md", tokens: 400 }],
          totalTokens: 400,
          estimatedWastePercent: 0,
          ignoreCoverage: {
            ignoreFilesFound: [],
            artifacts: [{ target: "pnpm-lock.yaml", covered: false }],
          },
        },
      });

      const html = await buildReportHtml(result, {
        cwd: repo.path,
        repoName: "demo-repo",
        generatedAt: new Date("2026-09-03T12:00:00.000Z"),
        history: [],
      });

      expect(html).toContain("AI context surface");
      expect(html).toContain("pnpm-lock.yaml");
    } finally {
      await repo.cleanup();
    }
  });

  it("has no snippet for a finding without a line number", async () => {
    const repo = await createTempDir("html-adapter-no-line");
    try {
      const result = baseAuditResult({
        findings: [
          {
            ruleId: "sec/no-secrets-in-code",
            file: "src/a.ts",
            severity: "error",
            message: "A secret looks hardcoded.",
            fixPrompt: "Fix it.",
          },
        ],
      });

      const html = await buildReportHtml(result, {
        cwd: repo.path,
        repoName: "demo-repo",
        generatedAt: new Date("2026-09-03T12:00:00.000Z"),
        history: [],
      });

      expect(html).not.toContain("Show code");
    } finally {
      await repo.cleanup();
    }
  });
});
