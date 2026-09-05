import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RegexRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

/**
 * Line-level regex patterns, scoped to files matching the rule's `files`
 * glob, and optionally gated on whole-file content by `pattern.when` /
 * `pattern.unless`.
 */
export async function runRegexTier(
  rule: RegexRule,
  ctx: TierContext,
): Promise<TierResult> {
  // dot: true — scannedFiles includes dotfiles (see scan.ts), and without
  // it micromatch's `**` won't match a dotfile segment even under a `!`
  // exclusion pattern like "!**/fixtures/**".
  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  const regex = new RegExp(rule.pattern.regex, rule.pattern.flags);
  const when = rule.pattern.when;
  const whenRegex = when === undefined ? undefined : new RegExp(when.regex, when.flags);
  const unless = rule.pattern.unless;
  const unlessRegex =
    unless === undefined ? undefined : new RegExp(unless.regex, unless.flags);
  const minCount = rule.pattern.minCount;
  const findings: Finding[] = [];
  const warnings: string[] = [];

  for (const file of matches) {
    let content: string;
    try {
      content = await readFile(join(ctx.cwd, file), "utf-8");
    } catch (error) {
      warnings.push(
        `${rule.id}: could not read ${file} (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }

    // Whole-file precondition, then whole-file suppression — both are
    // evaluated against the file's raw content before any line is looked
    // at, so a rule can require context the line-level `regex` can't see
    // (DECISIONS/0028) and rule out context that makes the match benign
    // (DECISIONS/0008). `when` runs first only because failing it is the
    // cheaper, more common exit for the rules that use it.
    if (whenRegex !== undefined) {
      whenRegex.lastIndex = 0; // reset in case of a stateful global/sticky flag
      if (!whenRegex.test(content)) {
        continue;
      }
    }

    if (unlessRegex !== undefined) {
      unlessRegex.lastIndex = 0; // reset in case of a stateful global/sticky flag
      if (unlessRegex.test(content)) {
        continue;
      }
    }

    if (minCount !== undefined) {
      const finding = findThresholdCrossing(rule, file, content, minCount);
      if (finding !== undefined) {
        findings.push(finding);
      }
      continue;
    }

    const lines = content.split("\n");
    for (const [index, line] of lines.entries()) {
      regex.lastIndex = 0; // reset stateful global/sticky regex between lines
      if (regex.test(line)) {
        const lineNumber = index + 1;
        findings.push({
          ruleId: rule.id,
          file,
          line: lineNumber,
          severity: rule.severity,
          message: rule.message,
          fixPrompt: buildFixPrompt(rule, file, lineNumber),
        });
      }
    }
  }

  return { findings, warnings };
}

/**
 * `minCount` mode (DECISIONS/0011): counts every occurrence of `regex`
 * across the whole file (not just matching lines), and produces a single
 * finding — anchored at the threshold-crossing occurrence's line — once
 * that count reaches `minCount`. Below it, the file is silently fine: a
 * handful of one-off matches is normal, only volume is the signal.
 */
function findThresholdCrossing(
  rule: RegexRule,
  file: string,
  content: string,
  minCount: number,
): Finding | undefined {
  const flags = rule.pattern.flags?.includes("g")
    ? rule.pattern.flags
    : `${rule.pattern.flags ?? ""}g`;
  const globalRegex = new RegExp(rule.pattern.regex, flags);
  const occurrences = [...content.matchAll(globalRegex)];
  if (occurrences.length < minCount) {
    return undefined;
  }

  const thresholdMatch = occurrences[minCount - 1];
  const matchIndex = thresholdMatch?.index ?? 0;
  const lineNumber = content.slice(0, matchIndex).split("\n").length;

  return {
    ruleId: rule.id,
    file,
    line: lineNumber,
    severity: rule.severity,
    message: rule.message,
    fixPrompt: buildFixPrompt(
      rule,
      file,
      lineNumber,
      `${occurrences.length} occurrences, threshold ${minCount}`,
    ),
  };
}
