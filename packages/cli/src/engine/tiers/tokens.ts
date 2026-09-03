import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TokensRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import { findDuplicateParagraphs } from "../text-duplication.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

/**
 * Dispatches on `pattern.check` (DECISIONS/0012) — one tier, two AI-
 * context-surface checks, since the only real difference between them is
 * the shape of `pattern`, the same "discriminate the payload, not the
 * tier" move the exists tier's `mode` and the regex tier's `unless`/
 * `minCount` already make. A third check, `ignore-coverage`, lived here
 * until DECISIONS/0016 moved it to the unscored token-surface report
 * (engine/token-surface.ts) — corpus review found it fired on 8/8 sampled
 * repos regardless of quality, zero discriminative signal for a scored
 * finding.
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
