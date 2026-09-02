import type { Finding } from "../types.js";

export interface TierContext {
  /** Repo root, for resolving file contents. */
  cwd: string;
  /** Full result of scanRepo() — every file the rule's `files` glob may scope to. */
  scannedFiles: string[];
}

export interface TierResult {
  findings: Finding[];
  /** Non-fatal issues (e.g. "tier not implemented yet") for the caller to surface. */
  warnings: string[];
}
