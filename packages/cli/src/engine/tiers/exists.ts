import type { ExistsRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import { matchesAnyGlob } from "../glob.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

/** File presence/absence checks: does anything matching `files` exist (or not)? */
export async function runExistsTier(
  rule: ExistsRule,
  ctx: TierContext,
): Promise<TierResult> {
  const when = rule.pattern.when;
  if (when !== undefined && !matchesAnyGlob(ctx.scannedFiles, when.files)) {
    // Precondition unmet — this repo isn't the kind this rule cares about
    // (e.g. no API surface), so don't check for the target file at all.
    return { findings: [], warnings: [] };
  }

  // dot: true — scannedFiles includes dotfiles (see scan.ts).
  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });

  if (rule.pattern.mode === "absent") {
    const findings: Finding[] = matches.map((file) => ({
      ruleId: rule.id,
      file,
      severity: rule.severity,
      message: rule.message,
      fixPrompt: buildFixPrompt(rule, file),
    }));
    return { findings, warnings: [] };
  }

  // mode === "present": a violation means nothing matched. Report it against
  // the expected path so the user knows what's missing.
  if (matches.length > 0) {
    return { findings: [], warnings: [] };
  }

  const [expected] = rule.files;
  if (expected === undefined) {
    // Unreachable: ruleSchema requires files.length >= 1.
    return { findings: [], warnings: [] };
  }

  return {
    findings: [
      {
        ruleId: rule.id,
        file: expected,
        severity: rule.severity,
        message: rule.message,
        fixPrompt: buildFixPrompt(rule, expected),
      },
    ],
    warnings: [],
  };
}
