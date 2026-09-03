import { describe, expect, it } from "vitest";
import { extractSnippet } from "../../src/render/snippet.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("extractSnippet", () => {
  it("returns up to 3 lines of context on each side of the offending line", async () => {
    const repo = await createTempDir("snippet-context");
    try {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      await repo.write("src/a.ts", lines.join("\n"));

      const snippet = await extractSnippet(repo.path, "src/a.ts", 10, new Map());

      expect(snippet).toBeDefined();
      expect(snippet?.map((l) => l.number)).toEqual([7, 8, 9, 10, 11, 12, 13]);
      expect(snippet?.find((l) => l.number === 10)).toEqual({
        number: 10,
        text: "line 10",
        highlighted: true,
      });
      expect(snippet?.filter((l) => l.highlighted)).toHaveLength(1);
    } finally {
      await repo.cleanup();
    }
  });

  it("clamps the window at the start of the file", async () => {
    const repo = await createTempDir("snippet-start");
    try {
      await repo.write("src/a.ts", "a\nb\nc\nd\ne\n");
      const snippet = await extractSnippet(repo.path, "src/a.ts", 1, new Map());
      expect(snippet?.map((l) => l.number)).toEqual([1, 2, 3, 4]);
    } finally {
      await repo.cleanup();
    }
  });

  it("clamps the window at the end of the file", async () => {
    const repo = await createTempDir("snippet-end");
    try {
      await repo.write("src/a.ts", "a\nb\nc\n");
      // "a\nb\nc\n".split("\n") -> ["a", "b", "c", ""], 4 lines.
      const snippet = await extractSnippet(repo.path, "src/a.ts", 4, new Map());
      expect(snippet?.map((l) => l.number)).toEqual([1, 2, 3, 4]);
    } finally {
      await repo.cleanup();
    }
  });

  it("returns undefined for a line number outside the file", async () => {
    const repo = await createTempDir("snippet-out-of-range");
    try {
      await repo.write("src/a.ts", "a\nb\nc\n");
      expect(
        await extractSnippet(repo.path, "src/a.ts", 999, new Map()),
      ).toBeUndefined();
      expect(await extractSnippet(repo.path, "src/a.ts", 0, new Map())).toBeUndefined();
    } finally {
      await repo.cleanup();
    }
  });

  it("returns undefined and never throws when the file can't be read", async () => {
    const repo = await createTempDir("snippet-missing-file");
    try {
      const snippet = await extractSnippet(
        repo.path,
        "does/not-exist.ts",
        1,
        new Map(),
      );
      expect(snippet).toBeUndefined();
    } finally {
      await repo.cleanup();
    }
  });

  it("reads a given file only once across multiple calls sharing a cache", async () => {
    const repo = await createTempDir("snippet-cache");
    try {
      await repo.write("src/a.ts", "a\nb\nc\nd\ne\n");
      const cache = new Map<string, string[] | undefined>();

      const first = await extractSnippet(repo.path, "src/a.ts", 1, cache);
      expect(cache.has("src/a.ts")).toBe(true);

      // Mutate the file on disk — a cached read should NOT see this change,
      // proving the second call reused the cache instead of re-reading.
      await repo.write("src/a.ts", "z\ny\nx\nw\nv\n");
      const second = await extractSnippet(repo.path, "src/a.ts", 1, cache);

      expect(second?.[0]?.text).toBe(first?.[0]?.text);
    } finally {
      await repo.cleanup();
    }
  });
});
