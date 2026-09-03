import { renderReportHtml } from "@pickcheck/report/render";
import type {
  ReportCategoryScore,
  ReportData,
  ReportFinding,
  ReportTokenSurface,
} from "@pickcheck/report/types";
import type { AuditResult } from "../engine/audit.js";
import type { HistoryEntry } from "../engine/history.js";
import { computeRulesetFingerprint } from "../engine/history.js";
import { CATEGORY_WEIGHTS } from "../engine/scorer.js";
import { getVersion } from "../version.js";
import { extractSnippet } from "./snippet.js";

export interface HtmlReportOptions {
  cwd: string;
  repoName: string;
  generatedAt: Date;
  /** Prior runs only (this run is not appended yet) — most recent last. */
  history: HistoryEntry[];
}

/** Builds the full self-contained HTML report string for `result` — see DECISIONS/0019. */
export async function buildReportHtml(
  result: AuditResult,
  options: HtmlReportOptions,
): Promise<string> {
  const rulesetVersion = computeRulesetFingerprint(result.rules);
  const ruleById = new Map(result.rules.map((rule) => [rule.id, rule]));
  const snippetCache = new Map<string, string[] | undefined>();

  const findings: ReportFinding[] = [];
  const warnings = [...result.warnings];

  for (const finding of result.findings) {
    const rule = ruleById.get(finding.ruleId);
    if (rule === undefined) {
      // Shouldn't happen — dispatchTier() always stamps a finding's ruleId
      // from the rule that produced it — but never fabricate a category
      // for a finding we can't attribute; skip and say why instead.
      warnings.push(`report: finding for unknown rule "${finding.ruleId}" — skipped`);
      continue;
    }

    const snippet =
      finding.line === undefined
        ? undefined
        : await extractSnippet(options.cwd, finding.file, finding.line, snippetCache);

    findings.push({
      ruleId: finding.ruleId,
      ruleTitle: rule.title,
      category: rule.category,
      severity: finding.severity,
      file: finding.file,
      line: finding.line,
      message: finding.message,
      fixPrompt: finding.fixPrompt,
      snippet,
    });
  }

  const categories: ReportCategoryScore[] = result.score.categories.map((entry) => ({
    category: entry.category,
    score: entry.score,
    weight: CATEGORY_WEIGHTS[entry.category],
  }));

  const previousEntry = options.history.at(-1);
  const previous =
    previousEntry === undefined
      ? undefined
      : {
          composite: previousEntry.composite,
          timestamp: previousEntry.timestamp,
          sameRuleset: previousEntry.rulesetVersion === rulesetVersion,
        };

  const history = [
    ...options.history.map((entry) => ({
      timestamp: entry.timestamp,
      composite: entry.composite,
    })),
    { timestamp: options.generatedAt.toISOString(), composite: result.score.composite },
  ];

  const tokenSurface: ReportTokenSurface | undefined =
    result.tokenSurface === undefined
      ? undefined
      : {
          files: result.tokenSurface.files,
          totalTokens: result.tokenSurface.totalTokens,
          estimatedWastePercent: result.tokenSurface.estimatedWastePercent,
          ignoreFilesFound: result.tokenSurface.ignoreCoverage?.ignoreFilesFound ?? [],
          uncoveredArtifacts: result.tokenSurface.ignoreCoverage?.artifacts ?? [],
        };

  const data: ReportData = {
    repoName: options.repoName,
    generatedAt: options.generatedAt.toISOString(),
    pickcheckVersion: getVersion(),
    rulesetVersion,
    composite: result.score.composite,
    previous,
    history,
    categories,
    findings,
    warnings,
    fileCount: result.fileCount,
    ruleCount: result.rules.length,
    tokenSurface,
  };

  return renderReportHtml(data);
}
