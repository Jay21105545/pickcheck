import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  generateChangelogPrompt,
  NoCommitsFoundError,
} from "../../../src/engine/generators/changelog.js";
import { createTempDir } from "../../helpers/temp-dir.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function initGitRepoWithCommits(cwd: string, subjects: string[]): Promise<void> {
  await git(cwd, ["init", "--initial-branch=main"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test"]);
  for (const [index, subject] of subjects.entries()) {
    await git(cwd, [
      "commit",
      "--allow-empty",
      "-m",
      subject,
      `--date=2026-01-0${index + 1}T00:00:00`,
    ]);
  }
}

describe("generateChangelogPrompt", () => {
  it("groups commits by conventional type into pickcheck-prompt.md", async () => {
    const repo = await createTempDir("gen-changelog");
    try {
      await initGitRepoWithCommits(repo.path, [
        "feat(cli): add init command",
        "fix(scorer): correct rounding",
        "chore: bump deps",
        "not a conventional commit at all",
      ]);

      const result = await generateChangelogPrompt({ cwd: repo.path });

      expect(result.commitCount).toBe(4);
      expect(result.prompt).toContain("**feat** (1)");
      expect(result.prompt).toContain("add init command");
      expect(result.prompt).toContain("**fix** (1)");
      expect(result.prompt).toContain("correct rounding");
      expect(result.prompt).toContain("**chore** (1)");
      expect(result.prompt).toContain("**other** (1)");
      expect(result.prompt).toContain("not a conventional commit at all");
    } finally {
      await repo.cleanup();
    }
  });

  it("only includes commits since the last tag when one exists", async () => {
    const repo = await createTempDir("gen-changelog-tag");
    try {
      await initGitRepoWithCommits(repo.path, ["feat: pre-tag commit"]);
      await git(repo.path, ["tag", "v1.0.0"]);
      await initGitRepoWithCommits(repo.path, ["fix: post-tag commit"]);

      const result = await generateChangelogPrompt({ cwd: repo.path });

      expect(result.commitCount).toBe(1);
      expect(result.prompt).toContain("post-tag commit");
      expect(result.prompt).not.toContain("pre-tag commit");
    } finally {
      await repo.cleanup();
    }
  });

  it("throws NoCommitsFoundError when the directory isn't a git repo", async () => {
    const repo = await createTempDir("gen-changelog-not-git");
    try {
      await expect(generateChangelogPrompt({ cwd: repo.path })).rejects.toThrow(
        NoCommitsFoundError,
      );
    } finally {
      await repo.cleanup();
    }
  });
});
