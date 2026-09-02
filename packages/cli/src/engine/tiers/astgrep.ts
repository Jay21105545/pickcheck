import type { AstgrepRule } from "@pickcheck/rules/schema";
import type { TierContext, TierResult } from "./types.js";

/**
 * TODO(phase-1.1): implement structural matching via @ast-grep/napi.
 * CLAUDE.md's cold-start constraint requires lazy-loading it — only
 * `import("@ast-grep/napi")` here, inside this function, once an
 * astgrep-tier rule actually needs to run.
 *
 * Until then this tier is a no-op: it never crashes the audit (per
 * CLAUDE.md's "engine failures on a single rule log a warning and
 * continue"), it just can't produce findings yet.
 */
export async function runAstgrepTier(
  rule: AstgrepRule,
  _ctx: TierContext,
): Promise<TierResult> {
  return {
    findings: [],
    warnings: [
      `${rule.id}: astgrep tier not implemented yet (TODO phase-1.1) — skipped`,
    ],
  };
}
