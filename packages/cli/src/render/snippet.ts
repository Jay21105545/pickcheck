import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SnippetLine {
  /** 1-based source line number. */
  number: number;
  text: string;
  /** Whether this is the finding's own offending line. */
  highlighted: boolean;
}

/** Lines of context shown above and below the offending line. */
const CONTEXT_LINES = 3;

/**
 * Reads a small window of source around `line` for a finding card's
 * expandable snippet in the HTML report. `cache` is shared across calls
 * (keyed by file path, relative to `cwd`) so multiple findings in the same
 * file only read it once. Never throws: an unreadable file (deleted since
 * the scan, permission error, binary content, etc.) just means no snippet
 * for that finding — same "never crash" contract every other file read in
 * this codebase follows.
 */
export async function extractSnippet(
  cwd: string,
  file: string,
  line: number,
  cache: Map<string, string[] | undefined>,
): Promise<SnippetLine[] | undefined> {
  let lines: string[] | undefined;
  if (cache.has(file)) {
    lines = cache.get(file);
  } else {
    lines = await tryReadLines(join(cwd, file));
    cache.set(file, lines);
  }

  if (lines === undefined || line < 1 || line > lines.length) {
    return undefined;
  }

  const startLine = Math.max(1, line - CONTEXT_LINES);
  const endLine = Math.min(lines.length, line + CONTEXT_LINES);

  const snippet: SnippetLine[] = [];
  for (let number = startLine; number <= endLine; number++) {
    snippet.push({
      number,
      text: lines[number - 1] ?? "",
      highlighted: number === line,
    });
  }
  return snippet;
}

async function tryReadLines(path: string): Promise<string[] | undefined> {
  try {
    const content = await readFile(path, "utf-8");
    return content.split("\n");
  } catch {
    return undefined;
  }
}
