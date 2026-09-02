import type { AuditResult } from "../engine/audit.js";

export interface JsonReport {
  composite: number;
  categories: AuditResult["score"]["categories"];
  findings: AuditResult["findings"];
  warnings: string[];
  fileCount: number;
  ruleCount: number;
}

export function toJsonReport(result: AuditResult): JsonReport {
  return {
    composite: result.score.composite,
    categories: result.score.categories,
    findings: result.findings,
    warnings: result.warnings,
    fileCount: result.fileCount,
    ruleCount: result.rules.length,
  };
}

/** `--json` machine output: no other renderer output on this path. */
export function renderJson(result: AuditResult): string {
  return JSON.stringify(toJsonReport(result), null, 2);
}
