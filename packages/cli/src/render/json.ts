import type { AuditResult } from "../engine/audit.js";

export interface JsonReport {
  composite: number;
  categories: AuditResult["score"]["categories"];
  findings: AuditResult["findings"];
  warnings: string[];
  fileCount: number;
  ruleCount: number;
  tokenSurface: AuditResult["tokenSurface"];
  /** Repo-root-relative path the HTML report was written to — present only when `--report` was passed. */
  reportPath?: string;
}

export function toJsonReport(result: AuditResult, reportPath?: string): JsonReport {
  return {
    composite: result.score.composite,
    categories: result.score.categories,
    findings: result.findings,
    warnings: result.warnings,
    fileCount: result.fileCount,
    ruleCount: result.rules.length,
    tokenSurface: result.tokenSurface,
    // exactOptionalPropertyTypes: only include the key when there's a path,
    // rather than ever writing `reportPath: undefined` explicitly — keeps
    // json.test.ts's fixed key-set assertion unaffected when `--report`
    // wasn't requested.
    ...(reportPath === undefined ? {} : { reportPath }),
  };
}

/** `--json` machine output: no other renderer output on this path. */
export function renderJson(result: AuditResult, reportPath?: string): string {
  return JSON.stringify(toJsonReport(result, reportPath), null, 2);
}
