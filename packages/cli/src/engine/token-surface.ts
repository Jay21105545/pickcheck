import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

export interface TokenSurfaceFile {
  file: string;
  tokens: number;
}

export interface TokenSurfaceReport {
  files: TokenSurfaceFile[];
  totalTokens: number;
  /** Estimated % of totalTokens spent on content duplicated across files. */
  estimatedWastePercent: number;
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
  if (matches.length === 0) {
    return { report: undefined, warnings: [] };
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

  return { report: { files, totalTokens, estimatedWastePercent }, warnings };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
