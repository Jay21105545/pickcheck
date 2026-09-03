import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TokensRule } from "@pickcheck/rules/schema";
import ignore from "ignore";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import { findDuplicateParagraphs } from "../text-duplication.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

/**
 * Dispatches on `pattern.check` (DECISIONS/0012) — one tier, three AI-
 * context-surface checks, since the only real difference between them is
 * the shape of `pattern`, the same "discriminate the payload, not the
 * tier" move the exists tier's `mode` and the regex tier's `unless`/
 * `minCount` already make.
 */
export async function runTokensTier(
  rule: TokensRule,
  ctx: TierContext,
): Promise<TierResult> {
  switch (rule.pattern.check) {
    case "budget":
      return runBudgetCheck(rule, ctx);
    case "duplicate":
      return runDuplicateCheck(rule, ctx);
    case "ignore-coverage":
      return runIgnoreCoverageCheck(rule, ctx);
  }
}

/**
 * Per-file token budget via gpt-tokenizer, lazy-loaded (dynamic `import()`
 * inside this function, never at module scope) per CLAUDE.md's cold-start
 * constraint — paid for only once a budget-check rule actually runs.
 */
async function runBudgetCheck(rule: TokensRule, ctx: TierContext): Promise<TierResult> {
  if (rule.pattern.check !== "budget") {
    return { findings: [], warnings: [] };
  }
  const budget = rule.pattern.budget;

  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  if (matches.length === 0) {
    return { findings: [], warnings: [] };
  }

  let countTokens: (text: string) => number;
  try {
    ({ countTokens } = await import("gpt-tokenizer"));
  } catch (error) {
    return {
      findings: [],
      warnings: [
        `${rule.id}: could not load gpt-tokenizer (${describeError(error)}) — skipped`,
      ],
    };
  }

  const findings: Finding[] = [];
  const warnings: string[] = [];

  for (const file of matches) {
    let content: string;
    try {
      content = await readFile(join(ctx.cwd, file), "utf-8");
    } catch (error) {
      warnings.push(`${rule.id}: could not read ${file} (${describeError(error)})`);
      continue;
    }

    const tokenCount = countTokens(content);
    if (tokenCount > budget) {
      findings.push({
        ruleId: rule.id,
        file,
        severity: rule.severity,
        message: rule.message,
        fixPrompt: buildFixPrompt(
          rule,
          file,
          undefined,
          `${tokenCount} tokens, budget ${budget}`,
        ),
      });
    }
  }

  return { findings, warnings };
}

/**
 * Cross-file duplicate-paragraph detection (see text-duplication.ts).
 * Needs at least two matched files to compare — one file can't duplicate
 * itself here — so a repo with only a lone CLAUDE.md is silently fine.
 */
async function runDuplicateCheck(
  rule: TokensRule,
  ctx: TierContext,
): Promise<TierResult> {
  if (rule.pattern.check !== "duplicate") {
    return { findings: [], warnings: [] };
  }
  const minChars = rule.pattern.minChars;

  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  if (matches.length < 2) {
    return { findings: [], warnings: [] };
  }

  const contents = new Map<string, string>();
  const warnings: string[] = [];
  for (const file of matches) {
    try {
      contents.set(file, await readFile(join(ctx.cwd, file), "utf-8"));
    } catch (error) {
      warnings.push(`${rule.id}: could not read ${file} (${describeError(error)})`);
    }
  }

  const duplicates = findDuplicateParagraphs(contents, minChars);
  const findings: Finding[] = duplicates.map((match) => ({
    ruleId: rule.id,
    file: match.fileA,
    line: match.paragraphA.line,
    severity: rule.severity,
    message: rule.message,
    fixPrompt: buildFixPrompt(
      rule,
      match.fileA,
      match.paragraphA.line,
      `duplicated in ${match.fileB}:${match.paragraphB.line}`,
    ),
  }));

  return { findings, warnings };
}

/**
 * Checks that heavy/generated artifacts actually present on disk (lockfiles,
 * node_modules, build output) are covered by at least one AI-ignore file.
 *
 * `rule.files` deliberately holds lockfile names, not the ignore-file
 * candidates or the artifacts being checked: it exists to gate this rule's
 * *applicability* (ARCHITECTURE.md — a non-exists-tier rule is applicable
 * only if `files` matches a scanned file), and a tracked lockfile is a
 * reliable, git-visible signal that this is a dependency-heavy JS/TS repo
 * this check makes sense for. The candidates actually read are
 * `pattern.ignoreFiles`, and the artifacts actually checked are
 * `pattern.requiredPatterns` — both deliberately independent of the
 * gitignore-filtered `ctx.scannedFiles`, since node_modules/dist/build are
 * normally *excluded* from it by .gitignore, which is exactly the case
 * this rule exists to double-check isn't the *only* thing excluding them
 * (many AI tools don't consult .gitignore at all).
 */
async function runIgnoreCoverageCheck(
  rule: TokensRule,
  ctx: TierContext,
): Promise<TierResult> {
  if (rule.pattern.check !== "ignore-coverage") {
    return { findings: [], warnings: [] };
  }
  const { ignoreFiles, requiredPatterns } = rule.pattern;

  const filter = ignore();
  let anyIgnoreFileFound = false;
  const warnings: string[] = [];

  for (const name of ignoreFiles) {
    const content = await tryReadFile(join(ctx.cwd, name));
    if (content !== undefined) {
      filter.add(content);
      anyIgnoreFileFound = true;
    }
  }

  const findings: Finding[] = [];
  for (const target of requiredPatterns) {
    const present = await pathExists(join(ctx.cwd, target));
    if (!present || filter.ignores(target)) {
      continue;
    }
    findings.push({
      ruleId: rule.id,
      file: target,
      severity: rule.severity,
      message: rule.message,
      fixPrompt: buildFixPrompt(
        rule,
        target,
        undefined,
        anyIgnoreFileFound
          ? `not covered by ${ignoreFiles.join(" / ")}`
          : `no AI-ignore file found (looked for ${ignoreFiles.join(", ")})`,
      ),
    });
  }

  return { findings, warnings };
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
