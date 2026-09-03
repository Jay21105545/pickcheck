import { describe, expect, it } from "vitest";
import {
  extractParagraphs,
  findDuplicateParagraphs,
} from "../../src/engine/text-duplication.js";

describe("extractParagraphs", () => {
  it("splits on blank lines and keeps only paragraphs at or above minChars", () => {
    const content =
      "short\n\nThis paragraph is long enough to count as real content.\n";
    const paragraphs = extractParagraphs(content, 20);

    expect(paragraphs).toEqual([
      {
        text: "This paragraph is long enough to count as real content.",
        line: 3,
      },
    ]);
  });

  it("records the 1-indexed starting line of each kept paragraph", () => {
    const content = [
      "# Hi",
      "",
      "First long paragraph that clears the character threshold easily.",
      "",
      "",
      "Second long paragraph, also well past the character threshold.",
      "",
    ].join("\n");

    const paragraphs = extractParagraphs(content, 20);

    expect(paragraphs.map((p) => p.line)).toEqual([3, 6]);
  });
});

describe("findDuplicateParagraphs", () => {
  it("finds a paragraph shared verbatim (whitespace-normalized) across two files", () => {
    const shared = "This exact block of text appears in both files verbatim.";
    const contents = new Map([
      ["a.md", `# A\n\n${shared}\n`],
      ["b.md", `# B\n\n${shared}\n`],
    ]);

    const matches = findDuplicateParagraphs(contents, 20);

    expect(matches).toEqual([
      expect.objectContaining({ fileA: "a.md", fileB: "b.md" }),
    ]);
  });

  it("ignores whitespace differences when comparing paragraphs", () => {
    const contents = new Map([
      ["a.md", "This   paragraph has   extra   spacing throughout its text.\n"],
      ["b.md", "This paragraph has extra spacing throughout its text.\n"],
    ]);

    const matches = findDuplicateParagraphs(contents, 20);

    expect(matches).toHaveLength(1);
  });

  it("returns nothing when no paragraph is shared", () => {
    const contents = new Map([
      ["a.md", "Something entirely unique to file a, long enough to matter.\n"],
      ["b.md", "Something entirely different in file b, also long enough.\n"],
    ]);

    expect(findDuplicateParagraphs(contents, 20)).toEqual([]);
  });

  it("returns nothing with fewer than two files", () => {
    const contents = new Map([
      ["a.md", "Only one file here, nothing to compare against.\n"],
    ]);
    expect(findDuplicateParagraphs(contents, 20)).toEqual([]);
  });
});
