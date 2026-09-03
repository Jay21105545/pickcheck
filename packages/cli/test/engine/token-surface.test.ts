import { describe, expect, it } from "vitest";
import { computeTokenSurface } from "../../src/engine/token-surface.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("computeTokenSurface", () => {
  it("reports undefined with no warnings when no context files are present", async () => {
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
