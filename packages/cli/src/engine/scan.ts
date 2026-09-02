import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import ignore from "ignore";

// .gitignore itself is repo plumbing, like .git/ and node_modules/ — never
// audit-relevant content, so it's force-ignored the same way. Every other
// dotfile is scanned: rules like sec/no-env-in-git need to see `.env`.
const ALWAYS_IGNORED = ["**/.git/**", "**/node_modules/**", "**/.gitignore"];

export interface ScanOptions {
  /** Repo root to scan. */
  cwd: string;
}

/**
 * Lists every file in the repo, respecting .gitignore (if present) on top
 * of the always-ignored .git, node_modules, and .gitignore itself. Returned
 * paths are relative to `cwd`, POSIX-separated, and sorted for deterministic
 * output. Dotfiles (e.g. `.env`) are included — see ALWAYS_IGNORED above.
 */
export async function scanRepo({ cwd }: ScanOptions): Promise<string[]> {
  const gitignore = await readGitignore(cwd);
  const filter = ignore().add(gitignore);

  const files = await fg("**/*", {
    cwd,
    dot: true,
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
