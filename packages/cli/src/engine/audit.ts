import { loadRules } from "./loader.js";
import { scanRepo } from "./scan.js";
import type { ScoreResult } from "./scorer.js";
import { scoreFindings } from "./scorer.js";
import { dispatchTier } from "./tiers/index.js";
import type { TokenSurfaceReport } from "./token-surface.js";
import { computeTokenSurface } from "./token-surface.js";
import type { Finding, Rule } from "./types.js";

export interface AuditOptions {
  /** Repo root to scan and audit. */
  cwd: string;
  /** Directory to load rule.yaml files from (recursively). */
  rulesDir: string;
}

export interface AuditResult {
  findings: Finding[];
  rules: Rule[];
  score: ScoreResult;
  warnings: string[];
  fileCount: number;
  /** Unscored AI-context-surface stat (DECISIONS/0013) — undefined if no context files were found. */
  tokenSurface: TokenSurfaceReport | undefined;
}

/** The full engine pipeline: scan -> load rules -> dispatch tiers -> score. */
export async function runAudit(options: AuditOptions): Promise<AuditResult> {
  const [scannedFiles, loadResult] = await Promise.all([
    scanRepo({ cwd: options.cwd }),
    loadRules(options.rulesDir),
  ]);

  const warnings = [...loadResult.warnings];
  const findings: Finding[] = [];

  for (const rule of loadResult.rules) {
    const tierResult = await dispatchTier(rule, { cwd: options.cwd, scannedFiles });
    findings.push(...tierResult.findings);
    warnings.push(...tierResult.warnings);
  }

  const score = scoreFindings(findings, loadResult.rules, scannedFiles);
  const tokenSurfaceResult = await computeTokenSurface(options.cwd, scannedFiles);
  warnings.push(...tokenSurfaceResult.warnings);

  return {
    findings,
    rules: loadResult.rules,
    score,
    warnings,
    fileCount: scannedFiles.length,
    tokenSurface: tokenSurfaceResult.report,
  };
}
