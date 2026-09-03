export type { Category, Severity } from "@pickcheck/rules/schema";

import type { Category, Severity } from "@pickcheck/rules/schema";

export interface ReportSnippetLine {
  /** 1-based source line number. */
  number: number;
  text: string;
  /** Whether this is the offending line the finding points at. */
  highlighted: boolean;
}

export interface ReportFinding {
  ruleId: string;
  ruleTitle: string;
  category: Category;
  severity: Severity;
  file: string;
  line: number | undefined;
  message: string;
  fixPrompt: string;
  /** `undefined` when the source file couldn't be read at render time. */
  snippet: ReportSnippetLine[] | undefined;
}

export interface ReportCategoryScore {
  category: Category;
  score: number;
  weight: number;
}

export interface ReportTokenFile {
  file: string;
  tokens: number;
}

export interface ReportIgnoreCoverageArtifact {
  target: string;
  covered: boolean;
}

export interface ReportTokenSurface {
  files: ReportTokenFile[];
  totalTokens: number;
  estimatedWastePercent: number;
  ignoreFilesFound: string[];
  uncoveredArtifacts: ReportIgnoreCoverageArtifact[];
}

export interface ReportHistoryPoint {
  timestamp: string;
  composite: number;
}

export interface ReportPreviousRun {
  composite: number;
  timestamp: string;
  /** False when the ruleset fingerprint differs from the current run — the delta may not be a pure comparison. */
  sameRuleset: boolean;
}

export interface ReportData {
  repoName: string;
  /** ISO timestamp. */
  generatedAt: string;
  pickcheckVersion: string;
  rulesetVersion: string;
  composite: number;
  previous: ReportPreviousRun | undefined;
  /** Chronological (oldest first), includes the current run as the last point. At most a few dozen points. */
  history: ReportHistoryPoint[];
  categories: ReportCategoryScore[];
  findings: ReportFinding[];
  warnings: string[];
  fileCount: number;
  ruleCount: number;
  tokenSurface: ReportTokenSurface | undefined;
}
