import type { Rule } from "./types.js";

/**
 * A rule.yaml's `message` is the only user-facing text it defines — there's
 * no rule content yet (fixPrompt authoring, per CLAUDE.md, lives in each
 * rule's README.md) to draw a richer prompt from. Synthesize a paste-able
 * prompt from what the rule carries until real rules land.
 *
 * `context` is an optional, engine-computed fact a tier learned while
 * detecting this specific finding (a token count vs. its budget, which
 * other file a paragraph is duplicated from, which artifact an ignore file
 * doesn't cover) — not a new hardcoded prose string, just the concrete
 * numbers/paths substituted into the rule's own message.
 */
export function buildFixPrompt(
  rule: Rule,
  file: string,
  line?: number,
  context?: string,
): string {
  const location = line === undefined ? file : `${file}:${line}`;
  const detail = context === undefined ? "" : ` (${context})`;
  return `Fix "${rule.title}" (${rule.id}) at ${location}: ${rule.message}${detail}`;
}
