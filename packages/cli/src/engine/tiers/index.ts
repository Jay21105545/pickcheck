import type { Rule } from "../types.js";
import { runAstgrepTier } from "./astgrep.js";
import { runExistsTier } from "./exists.js";
import { runRegexTier } from "./regex.js";
import { runTokensTier } from "./tokens.js";
import type { TierContext, TierResult } from "./types.js";

export type { TierContext, TierResult } from "./types.js";

/** Routes a validated rule to the handler for its declared tier. */
export async function dispatchTier(rule: Rule, ctx: TierContext): Promise<TierResult> {
  switch (rule.tier) {
    case "exists":
      return runExistsTier(rule, ctx);
    case "regex":
      return runRegexTier(rule, ctx);
    case "astgrep":
      return runAstgrepTier(rule, ctx);
    case "tokens":
      return runTokensTier(rule, ctx);
  }
}
