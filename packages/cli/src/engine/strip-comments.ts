/**
 * Neutralizes `//` line comments and `/* … *\/` block comments — including
 * JSDoc type annotations like `/** @type {import('pkg')} *\/` — by
 * replacing their content (never their newlines) with spaces, so an
 * identifier-extraction regex can no longer read commented-out code or
 * plain English prose as live source.
 *
 * Shared by two tiers, for the same reason each time: the manifest tier's
 * specifier extraction (DECISIONS/0015 — a commented-out import is not an
 * import), and the coverage tier's identifier extraction (DECISIONS/0027 —
 * prose in a doc comment that happens to write `process.env.X` is not a
 * required setting; pickcheck's own `packages/rules/schema.ts` does
 * exactly that and self-audited as a finding until this was wired in).
 *
 * A quote
 * character only opens a string when it isn't already inside a comment,
 * and `//`/`/*` only open a comment when they aren't already inside a
 * string — this is a character-scan, not a real lexer, so it doesn't
 * handle every edge case (nested template-literal expressions, regex
 * literals containing `//`), but it correctly leaves a URL like
 * `"https://deno.land/…"` alone (the `//` is inside an open string) while
 * still stripping a genuine line comment or JSDoc block.
 */
export function stripComments(content: string): string {
  let result = "";
  let quote: "'" | '"' | "`" | undefined;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        result += ch;
      } else {
        result += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        result += "  ";
        i++;
      } else if (ch === "\n") {
        result += "\n";
      } else {
        result += " ";
      }
      continue;
    }

    if (quote !== undefined) {
      result += ch;
      if (ch === "\\" && next !== undefined) {
        result += next;
        i++;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      result += "  ";
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      result += "  ";
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      result += ch;
      continue;
    }
    result += ch;
  }

  return result;
}
