import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import ignore from "ignore";

// .gitignore and .pickcheckignore are repo plumbing, like .git/ and
// node_modules/ — never audit-relevant content, so they're force-ignored
// the same way. Every other dotfile is scanned: rules like
// sec/no-env-in-git need to see `.env`.
const ALWAYS_IGNORED = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.gitignore",
  "**/.pickcheckignore",
];

export interface ScanOptions {
  /** Repo root to scan. */
  cwd: string;
}

/**
 * Lists every file in the repo, respecting .gitignore and .pickcheckignore
 * (both optional, same gitignore pattern syntax) on top of the
 * always-ignored .git, node_modules, and the ignore files themselves.
 * .pickcheckignore exists for content that's legitimately git-tracked but
 * shouldn't be audited — e.g. this repo's own .pickcheckignore excludes
 * examples/, whose whole purpose is to contain deliberately bad code (see
 * DECISIONS/0006). Returned paths are relative to `cwd`, POSIX-separated,
 * and sorted for deterministic output. Dotfiles (e.g. `.env`) are
 * included — see ALWAYS_IGNORED above.
 */
export async function scanRepo({ cwd }: ScanOptions): Promise<string[]> {
  const [gitignore, pickcheckignore] = await Promise.all([
    readIgnoreFile(cwd, ".gitignore"),
    readIgnoreFile(cwd, ".pickcheckignore"),
  ]);
  const filter = ignore().add(gitignore).add(pickcheckignore);

  const files = await fg("**/*", {
    cwd,
    dot: true,
    onlyFiles: true,
    ignore: ALWAYS_IGNORED,
  });

  return files.filter((file) => !filter.ignores(file)).sort();
}

async function readIgnoreFile(cwd: string, name: string): Promise<string> {
  try {
    return await readFile(join(cwd, name), "utf-8");
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
