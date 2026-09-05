import { computePackageScriptTargets } from "../package-scripts.js";
import type { Rule } from "../types.js";
import { runAstgrepTier } from "./astgrep.js";
import { runCoverageTier } from "./coverage.js";
import { runExistsTier } from "./exists.js";
import { runManifestTier } from "./manifest.js";
import { runRegexTier } from "./regex.js";
import { runTokensTier } from "./tokens.js";
import type { TierContext, TierResult } from "./types.js";

export type { TierContext, TierResult } from "./types.js";

/**
 * Routes a validated rule to the handler for its declared tier. Applies
 * `excludePackageScriptTargets` (DECISIONS/0017) uniformly before dispatch,
 * regardless of tier, by filtering it out of `ctx.scannedFiles` — every
 * tier derives its own `matches` from that list, so this is a single choke
 * point rather than a per-tier special case.
 */
export async function dispatchTier(rule: Rule, ctx: TierContext): Promise<TierResult> {
  if (rule.excludePackageScriptTargets) {
    const targets = await computePackageScriptTargets(ctx.cwd, ctx.scannedFiles);
    if (targets.size > 0) {
      ctx = {
        ...ctx,
        scannedFiles: ctx.scannedFiles.filter((file) => !targets.has(file)),
      };
    }
  }

  switch (rule.tier) {
    case "exists":
      return runExistsTier(rule, ctx);
    case "regex":
      return runRegexTier(rule, ctx);
    case "astgrep":
      return runAstgrepTier(rule, ctx);
    case "tokens":
      return runTokensTier(rule, ctx);
    case "manifest":
      return runManifestTier(rule, ctx);
    case "coverage":
      return runCoverageTier(rule, ctx);
  }
}
