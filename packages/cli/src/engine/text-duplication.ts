/**
 * Paragraph-level duplicate-content detection, shared by the tokens tier's
 * `tok/context-duplication` rule and the unscored AI-context-surface report
 * (DECISIONS/0013) — kept in one place so both compute "which context files
 * share verbatim content" the same way rather than drifting apart.
 */

export interface Paragraph {
  text: string;
  /** 1-indexed line the paragraph starts on. */
  line: number;
}

export interface DuplicateMatch {
  fileA: string;
  fileB: string;
  paragraphA: Paragraph;
  paragraphB: Paragraph;
}

/**
 * Splits file content into blank-line-delimited paragraphs, keeping only
 * ones at or above `minChars` (trimmed) — short paragraphs (a heading, a
 * one-line note) coincide across files constantly without meaning anything
 * was actually copy-pasted.
 */
export function extractParagraphs(content: string, minChars: number): Paragraph[] {
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];
  let buffer: string[] = [];
  let startLine = 1;

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const text = buffer.join("\n").trim();
    if (text.length >= minChars) {
      paragraphs.push({ text, line: startLine });
    }
    buffer = [];
  };

  lines.forEach((line, index) => {
    if (line.trim() === "") {
      flush();
    } else {
      if (buffer.length === 0) {
        startLine = index + 1;
      }
      buffer.push(line);
    }
  });
  flush();

  return paragraphs;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Compares every pair of matched files' paragraphs and returns one match
 * per file-pair that shares any verbatim (whitespace-normalized) paragraph
 * — the first one found, not every one, to keep this a "these two files
 * duplicate content" signal rather than a line-by-line diff.
 */
export function findDuplicateParagraphs(
  contentsByFile: Map<string, string>,
  minChars: number,
): DuplicateMatch[] {
  const paragraphsByFile = new Map<string, Paragraph[]>();
  for (const [file, content] of contentsByFile) {
    paragraphsByFile.set(file, extractParagraphs(content, minChars));
  }

  const files = [...paragraphsByFile.keys()];
  const matches: DuplicateMatch[] = [];

  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const fileA = files[i];
      const fileB = files[j];
      if (fileA === undefined || fileB === undefined) {
        continue;
      }
      const paragraphsA = paragraphsByFile.get(fileA) ?? [];
      const paragraphsB = paragraphsByFile.get(fileB) ?? [];
      const found = findFirstSharedParagraph(paragraphsA, paragraphsB);
      if (found !== undefined) {
        matches.push({ fileA, fileB, paragraphA: found.a, paragraphB: found.b });
      }
    }
  }

  return matches;
}

function findFirstSharedParagraph(
  paragraphsA: Paragraph[],
  paragraphsB: Paragraph[],
): { a: Paragraph; b: Paragraph } | undefined {
  for (const paragraphA of paragraphsA) {
    const paragraphB = paragraphsB.find(
      (candidate) => normalize(candidate.text) === normalize(paragraphA.text),
    );
    if (paragraphB !== undefined) {
      return { a: paragraphA, b: paragraphB };
    }
  }
  return undefined;
}
