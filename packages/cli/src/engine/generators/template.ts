/**
 * Replaces `{{TOKEN}}` placeholders with values from `vars`. An unknown
 * token is left as-is rather than replaced with an empty string or
 * throwing — a typo in a template should be visible in the output, not
 * silently swallowed.
 */
export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}
