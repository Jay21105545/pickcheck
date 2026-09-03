import { readFile } from "node:fs/promises";
import { basename, join, normalize, dirname as posixDirname } from "node:path/posix";

/**
 * A whole script-argument token that looks like a relative file path ending
 * in a JS/TS extension — word/path characters only, so a comma-joined flag
 * value like `.ts,.tsx` (from `eslint . --ext .ts,.tsx`) can't match: the
 * comma isn't in the allowed character class, so the required trailing
 * `.ts`/`.tsx`/etc. never lines up with the end of the token.
 */
const SCRIPT_TARGET_TOKEN = /^[.\w][\w./-]*\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * The set of repo-root-relative file paths that are the direct execution
 * target of some `package.json` `scripts` entry — e.g. `"db:setup": "npx
 * tsx lib/db/setup.ts"` yields `lib/db/setup.ts`. Used to exempt one-off
 * developer CLI scripts (interactive prompts, seed/setup scripts invoked
 * via `npm run ...`) from rules that shouldn't apply to them, the same way
 * `!**\/scripts/**` already does for scripts living under a directory
 * literally named that — DECISIONS/0017. Checks every `package.json` among
 * `scannedFiles`, not just the repo root, so a workspace package's own
 * scripts are covered too; each script's targets are resolved relative to
 * *that* package.json's own directory (where `npm run` actually executes
 * from), not the scanned root.
 */
export async function computePackageScriptTargets(
  cwd: string,
  scannedFiles: string[],
): Promise<Set<string>> {
  const packageJsonFiles = scannedFiles.filter(
    (file) => basename(file) === "package.json",
  );
  const targets = new Set<string>();

  for (const packageJsonFile of packageJsonFiles) {
    const scripts = await tryReadScripts(join(cwd, packageJsonFile));
    if (scripts === undefined) {
      continue;
    }
    const dir = posixDirname(packageJsonFile);
    for (const command of Object.values(scripts)) {
      if (typeof command !== "string") {
        continue;
      }
      for (const token of extractScriptTargetTokens(command)) {
        targets.add(dir === "." ? normalize(token) : normalize(join(dir, token)));
      }
    }
  }

  return targets;
}

async function tryReadScripts(
  manifestPath: string,
): Promise<Record<string, unknown> | undefined> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const scripts = (parsed as Record<string, unknown>).scripts;
  return typeof scripts === "object" && scripts !== null
    ? (scripts as Record<string, unknown>)
    : undefined;
}

/** Splits a script command into shell-ish tokens (quotes respected, not fully parsed) and keeps only the path-like ones. */
function extractScriptTargetTokens(command: string): string[] {
  const rawTokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const targets: string[] = [];
  for (const raw of rawTokens) {
    const token = raw.replace(/^["']|["']$/g, "");
    if (!token.startsWith("-") && SCRIPT_TARGET_TOKEN.test(token)) {
      targets.push(token);
    }
  }
  return targets;
}
