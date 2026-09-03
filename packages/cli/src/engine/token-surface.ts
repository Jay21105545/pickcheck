import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import ignore from "ignore";
import micromatch from "micromatch";
import { findDuplicateParagraphs } from "./text-duplication.js";

/**
 * Conventional AI context file names/globs this report counts tokens
 * across — the same set an AI coding assistant would plausibly load into
 * every session. Kept here, not derived from `tok/*` rule data, because
 * this is a report (an unscored stat, per DECISIONS/0013), not a
 * detection rule — CLAUDE.md's "rules are data" governs scored findings,
 * not supplementary output.
 */
export const CONTEXT_FILE_GLOBS = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursorrules",
  ".cursor/rules/**/*.mdc",
  ".windsurfrules",
  ".clinerules",
  ".clinerules/**/*.md",
  ".github/copilot-instructions.md",
];

/** Paragraphs shared across two files are only "waste" once, not twice. */
const DUPLICATE_MIN_CHARS = 200;

/**
 * AI-ignore-file candidates read directly off disk, and the heavy/generated
 * artifacts checked against them — moved here from the former
 * `tok/ai-ignore-coverage` scored rule by DECISIONS/0016. Corpus review
 * found this check fires on effectively every real-world repo (8/8 sampled,
 * controls and AI-generated alike — none maintained one of these ignore
 * files at all), which is zero discriminative signal for a *scored*
 * finding: the same "always-on, can never let a clean repo reach 100"
 * failure DECISIONS/0013 already rejected for this same report. The
 * underlying fact (is this artifact covered) is still worth surfacing —
 * just as an unscored stat, not a category penalty. Kept as constants here
 * rather than derived from the old rule's data for the same reason
 * `CONTEXT_FILE_GLOBS` is: this is a report, not a detection rule.
 */
const IGNORE_FILE_CANDIDATES = [
  ".cursorignore",
  ".claudeignore",
  ".aiderignore",
  ".codeiumignore",
  ".windsurfignore",
  ".rooignore",
];

const IGNORE_COVERAGE_TARGETS = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
];

export interface TokenSurfaceFile {
  file: string;
  tokens: number;
}

export interface IgnoreCoverageArtifact {
  /** Repo-root-relative artifact path (e.g. "node_modules", "pnpm-lock.yaml"). */
  target: string;
  /** Whether some found AI-ignore file already covers this artifact. */
  covered: boolean;
}

export interface IgnoreCoverageReport {
  /** Which of IGNORE_FILE_CANDIDATES actually exist in this repo (may be empty). */
  ignoreFilesFound: string[];
  /** Only artifacts from IGNORE_COVERAGE_TARGETS that are actually present on disk. */
  artifacts: IgnoreCoverageArtifact[];
}

export interface TokenSurfaceReport {
  files: TokenSurfaceFile[];
  totalTokens: number;
  /** Estimated % of totalTokens spent on content duplicated across files. */
  estimatedWastePercent: number;
  /** `undefined` if none of IGNORE_COVERAGE_TARGETS is present on disk at all. */
  ignoreCoverage: IgnoreCoverageReport | undefined;
}

export interface TokenSurfaceResult {
  /** `undefined` if there's nothing to report — no context files found, or gpt-tokenizer failed to load. */
  report: TokenSurfaceReport | undefined;
  /** Non-fatal issues (e.g. an unreadable context file) — same contract as a tier's own `warnings`. */
  warnings: string[];
}

/**
 * Computes the AI-context-surface token report — same "never crash the
 * audit, just report less (and say why)" contract as a tier failing on a
 * single file per CLAUDE.md.
 */
export async function computeTokenSurface(
  cwd: string,
  scannedFiles: string[],
): Promise<TokenSurfaceResult> {
  const matches = micromatch(scannedFiles, CONTEXT_FILE_GLOBS, { dot: true });
  const ignoreCoverage = await computeIgnoreCoverage(cwd);

  if (matches.length === 0) {
    if (ignoreCoverage === undefined) {
      return { report: undefined, warnings: [] };
    }
    return {
      report: { files: [], totalTokens: 0, estimatedWastePercent: 0, ignoreCoverage },
      warnings: [],
    };
  }

  let countTokens: (text: string) => number;
  try {
    ({ countTokens } = await import("gpt-tokenizer"));
  } catch (error) {
    return {
      report: undefined,
      warnings: [
        `token-surface: could not load gpt-tokenizer (${describeError(error)})`,
      ],
    };
  }

  const contents = new Map<string, string>();
  const warnings: string[] = [];
  for (const file of matches) {
    try {
      contents.set(file, await readFile(join(cwd, file), "utf-8"));
    } catch (error) {
      warnings.push(`token-surface: could not read ${file} (${describeError(error)})`);
    }
  }

  const files: TokenSurfaceFile[] = [...contents.entries()].map(([file, content]) => ({
    file,
    tokens: countTokens(content),
  }));
  const totalTokens = files.reduce((sum, entry) => sum + entry.tokens, 0);

  const duplicates = findDuplicateParagraphs(contents, DUPLICATE_MIN_CHARS);
  // Each duplicate pair costs one copy's worth of tokens — the one that
  // could be deleted and replaced with a reference to the other file.
  const duplicatedTokens = duplicates.reduce(
    (sum, match) => sum + countTokens(match.paragraphA.text),
    0,
  );
  const estimatedWastePercent =
    totalTokens === 0 ? 0 : round((duplicatedTokens / totalTokens) * 100);

  return {
    report: { files, totalTokens, estimatedWastePercent, ignoreCoverage },
    warnings,
  };
}

/**
 * Checks IGNORE_COVERAGE_TARGETS against the combined filter built from
 * whichever IGNORE_FILE_CANDIDATES exist — same logic the former
 * `tok/ai-ignore-coverage` rule ran, moved here as an unscored check
 * (DECISIONS/0016). Returns `undefined` when none of the target artifacts
 * is present at all, so an audit of, say, a Python repo with no lockfile
 * in this list doesn't render an empty/irrelevant section.
 */
async function computeIgnoreCoverage(
  cwd: string,
): Promise<IgnoreCoverageReport | undefined> {
  const filter = ignore();
  const ignoreFilesFound: string[] = [];
  for (const name of IGNORE_FILE_CANDIDATES) {
    const content = await tryReadFile(join(cwd, name));
    if (content !== undefined) {
      filter.add(content);
      ignoreFilesFound.push(name);
    }
  }

  const artifacts: IgnoreCoverageArtifact[] = [];
  for (const target of IGNORE_COVERAGE_TARGETS) {
    if (!(await pathExists(join(cwd, target)))) {
      continue;
    }
    artifacts.push({ target, covered: filter.ignores(target) });
  }

  return artifacts.length === 0 ? undefined : { ignoreFilesFound, artifacts };
}

async function tryReadFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
