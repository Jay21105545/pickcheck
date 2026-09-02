import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import ignore from "ignore";

const ALWAYS_IGNORED = ["**/.git/**", "**/node_modules/**"];

export interface ScanOptions {
  /** Repo root to scan. */
  cwd: string;
}

/**
 * Lists every file in the repo, respecting .gitignore (if present) on top
 * of the always-ignored .git and node_modules directories. Returned paths
 * are relative to `cwd`, POSIX-separated, and sorted for deterministic
 * output.
 */
export async function scanRepo({ cwd }: ScanOptions): Promise<string[]> {
  const gitignore = await readGitignore(cwd);
  const filter = ignore().add(gitignore);

  const files = await fg("**/*", {
    cwd,
    dot: false,
    onlyFiles: true,
    ignore: ALWAYS_IGNORED,
  });

  return files.filter((file) => !filter.ignores(file)).sort();
}

async function readGitignore(cwd: string): Promise<string> {
  try {
    return await readFile(join(cwd, ".gitignore"), "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
