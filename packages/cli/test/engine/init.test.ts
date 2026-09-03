import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../../src/engine/init.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("runInit", () => {
  it("scaffolds the full docs-kit into an empty repo", async () => {
    const repo = await createTempDir("init-empty");
    try {
      await repo.write(
        "package.json",
        JSON.stringify({ name: "demo-app", dependencies: { next: "^15.0.0" } }),
      );

      const result = await runInit({
        cwd: repo.path,
        assistants: ["claude", "agents"],
        minScore: 75,
      });

      expect(result.skipped).toEqual([]);
      expect(result.created).toEqual(
        [
          ".env.example",
          ".github/PULL_REQUEST_TEMPLATE.md",
          ".github/workflows/pickcheck.yml",
          "AGENTS.md",
          "API.md",
          "ARCHITECTURE.md",
          "CHANGELOG.md",
          "CLAUDE.md",
          "CONTRIBUTING.md",
          "DECISIONS/0001-record-architecture-decisions.md",
        ].sort(),
      );

      const workflow = await readFile(
        join(repo.path, ".github/workflows/pickcheck.yml"),
        "utf-8",
      );
      expect(workflow).toContain("audit --min 75");

      const architecture = await readFile(join(repo.path, "ARCHITECTURE.md"), "utf-8");
      expect(architecture).toContain("Framework: next");

      const claude = await readFile(join(repo.path, "CLAUDE.md"), "utf-8");
      expect(claude).toContain("demo-app");
      expect(claude).toContain("next");
    } finally {
      await repo.cleanup();
    }
  });

  it("never overwrites a file that already exists", async () => {
    const repo = await createTempDir("init-existing");
    try {
      await repo.write("package.json", JSON.stringify({ name: "demo" }));
      await repo.write("CHANGELOG.md", "# my own changelog, hands off\n");

      const result = await runInit({
        cwd: repo.path,
        assistants: ["claude"],
        minScore: 60,
      });

      expect(result.skipped).toContain("CHANGELOG.md");
      expect(result.created).not.toContain("CHANGELOG.md");

      const content = await readFile(join(repo.path, "CHANGELOG.md"), "utf-8");
      expect(content).toBe("# my own changelog, hands off\n");
    } finally {
      await repo.cleanup();
    }
  });

  it("seeds .env.example with keys from an existing .env, values stripped", async () => {
    const repo = await createTempDir("init-env");
    try {
      await repo.write("package.json", JSON.stringify({ name: "demo" }));
      await repo.write(
        ".env",
        "DATABASE_URL=postgres://secret@host/db\nAPI_KEY=sk-abc123\n",
      );

      await runInit({ cwd: repo.path, assistants: [], minScore: 60 });

      const envExample = await readFile(join(repo.path, ".env.example"), "utf-8");
      expect(envExample).toBe("API_KEY=\nDATABASE_URL=\n");
    } finally {
      await repo.cleanup();
    }
  });

  it("writes only the requested assistant conventions files", async () => {
    const repo = await createTempDir("init-assistants");
    try {
      await repo.write("package.json", JSON.stringify({ name: "demo" }));

      const result = await runInit({
        cwd: repo.path,
        assistants: ["agents"],
        minScore: 60,
      });

      expect(result.created).toContain("AGENTS.md");
      expect(result.created).not.toContain("CLAUDE.md");
    } finally {
      await repo.cleanup();
    }
  });
});
