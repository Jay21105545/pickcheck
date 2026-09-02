import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RegexRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

/** Line-level regex patterns, scoped to files matching the rule's `files` glob. */
export async function runRegexTier(
  rule: RegexRule,
  ctx: TierContext,
): Promise<TierResult> {
  const matches = micromatch(ctx.scannedFiles, rule.files);
  const regex = new RegExp(rule.pattern.regex, rule.pattern.flags);
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
