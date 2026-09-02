import type { Rule } from "./types.js";

/**
 * A rule.yaml's `message` is the only user-facing text it defines — there's
 * no rule content yet (fixPrompt authoring, per CLAUDE.md, lives in each
 * rule's README.md) to draw a richer prompt from. Synthesize a paste-able
 * prompt from what the rule carries until real rules land.
 */
export function buildFixPrompt(rule: Rule, file: string, line?: number): string {
  const location = line === undefined ? file : `${file}:${line}`;
  return `Fix "${rule.title}" (${rule.id}) at ${location}: ${rule.message}`;
}
