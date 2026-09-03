import { describe, expect, it } from "vitest";
import { computeTokenSurface } from "../../src/engine/token-surface.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("computeTokenSurface", () => {
  it("reports undefined with no warnings when there are no context files and nothing to check ignore coverage on", async () => {
    const result = await computeTokenSurface("/does/not/exist", ["src/a.ts"]);
    expect(result).toEqual({ report: undefined, warnings: [] });
  });

  it("counts tokens per matched context file and totals them", async () => {
    const dir = await createTempDir("token-surface-basic");
    try {
      await dir.write("CLAUDE.md", "Some project instructions here.");
      await dir.write("AGENTS.md", "Some other, unrelated instructions.");

      const { report, warnings } = await computeTokenSurface(dir.path, [
        "CLAUDE.md",
        "AGENTS.md",
      ]);

      expect(warnings).toEqual([]);
      expect(report).toBeDefined();
      expect(report?.files.map((f) => f.file).sort()).toEqual([
        "AGENTS.md",
        "CLAUDE.md",
      ]);
      expect(report?.totalTokens).toBe(
        report?.files.reduce((sum, f) => sum + f.tokens, 0),
      );
      expect(report?.totalTokens).toBeGreaterThan(0);
    } finally {
      await dir.cleanup();
    }
  });

  it("estimates 0% waste when files share no duplicated content", async () => {
    const dir = await createTempDir("token-surface-no-waste");
    try {
      await dir.write("CLAUDE.md", "Unique content for the Claude file only.");
      await dir.write("AGENTS.md", "Different, unrelated content for agents.");

      const { report } = await computeTokenSurface(dir.path, [
        "CLAUDE.md",
        "AGENTS.md",
      ]);

      expect(report?.estimatedWastePercent).toBe(0);
    } finally {
      await dir.cleanup();
    }
  });

  it("estimates nonzero waste when a large paragraph is duplicated across files", async () => {
    const dir = await createTempDir("token-surface-waste");
    try {
      const shared =
        "This is a fairly long shared paragraph that both context files repeat verbatim, wasting real tokens on every single AI session that loads them both into context. It needs to clear the 200-character duplicate-detection floor, so here is some extra padding text to get it comfortably past that threshold.";
      await dir.write("CLAUDE.md", `# Claude\n\n${shared}\n`);
      await dir.write("AGENTS.md", `# Agents\n\n${shared}\n`);

      const { report } = await computeTokenSurface(dir.path, [
        "CLAUDE.md",
        "AGENTS.md",
      ]);

      expect(report?.estimatedWastePercent).toBeGreaterThan(0);
    } finally {
      await dir.cleanup();
    }
  });

  it("reports ignoreCoverage even when no context files exist, as long as a covered artifact is present (DECISIONS/0016)", async () => {
    const dir = await createTempDir("token-surface-ignore-no-context");
    try {
      await dir.write("pnpm-lock.yaml", "lockfile: true\n");

      const { report, warnings } = await computeTokenSurface(dir.path, [
        "pnpm-lock.yaml",
      ]);

      expect(warnings).toEqual([]);
      expect(report).toBeDefined();
      expect(report?.files).toEqual([]);
      expect(report?.ignoreCoverage).toEqual({
        ignoreFilesFound: [],
        artifacts: [{ target: "pnpm-lock.yaml", covered: false }],
      });
    } finally {
      await dir.cleanup();
    }
  });

  it("marks an artifact covered once a matching AI-ignore file exists", async () => {
    const dir = await createTempDir("token-surface-ignore-covered");
    try {
      await dir.write("pnpm-lock.yaml", "lockfile: true\n");
      await dir.write("node_modules/some-pkg/index.js", "module.exports = {};\n");
      await dir.write(".cursorignore", "node_modules\n");

      const { report } = await computeTokenSurface(dir.path, [
        "pnpm-lock.yaml",
        ".cursorignore",
      ]);

      expect(report?.ignoreCoverage?.ignoreFilesFound).toEqual([".cursorignore"]);
      expect(report?.ignoreCoverage?.artifacts).toEqual(
        expect.arrayContaining([
          { target: "node_modules", covered: true },
          { target: "pnpm-lock.yaml", covered: false },
        ]),
      );
    } finally {
      await dir.cleanup();
    }
  });

  it("omits ignoreCoverage when none of the target artifacts is present on disk", async () => {
    const dir = await createTempDir("token-surface-ignore-absent");
    try {
      await dir.write("CLAUDE.md", "Some project instructions here.");

      const { report } = await computeTokenSurface(dir.path, ["CLAUDE.md"]);

      expect(report?.ignoreCoverage).toBeUndefined();
    } finally {
      await dir.cleanup();
    }
  });

  it("reports a warning and skips a context file that can't be read, without crashing", async () => {
    const dir = await createTempDir("token-surface-unreadable");
    try {
      await dir.write("CLAUDE.md", "Readable content.");
      // AGENTS.md is listed as scanned but never written to disk, simulating
      // an unreadable file (e.g. a race with a deletion) without relying on
      // filesystem permission games.
      const { report, warnings } = await computeTokenSurface(dir.path, [
        "CLAUDE.md",
        "AGENTS.md",
      ]);

      expect(warnings).toEqual([expect.stringContaining("AGENTS.md")]);
      expect(report?.files.map((f) => f.file)).toEqual(["CLAUDE.md"]);
    } finally {
      await dir.cleanup();
    }
  });
});
