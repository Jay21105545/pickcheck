import type { TokensRule } from "@pickcheck/rules/schema";
import type { TierContext, TierResult } from "./types.js";

/**
 * TODO(phase-3, per EXECUTION.md): implement token-budget checks via
 * gpt-tokenizer (WASM). CLAUDE.md's cold-start constraint requires
 * lazy-loading it — only a dynamic `import` of gpt-tokenizer here, inside
 * this function, once a tokens-tier rule actually needs to run.
 *
 * Until then this tier is a no-op: it never crashes the audit (per
 * CLAUDE.md's "engine failures on a single rule log a warning and
 * continue"), it just can't produce findings yet.
 */
export async function runTokensTier(
  rule: TokensRule,
  _ctx: TierContext,
): Promise<TierResult> {
  return {
    findings: [],
    warnings: [`${rule.id}: tokens tier not implemented yet (TODO phase-3) — skipped`],
  };
}
