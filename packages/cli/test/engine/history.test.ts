import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendHistoryEntry,
  computeRulesetFingerprint,
  readHistory,
} from "../../src/engine/history.js";
import type { Rule } from "../../src/engine/types.js";
import { createTempDir } from "../helpers/temp-dir.js";

const sampleEntry = {
  timestamp: "2026-01-01T00:00:00.000Z",
  composite: 88.5,
  categories: [{ category: "security" as const, score: 92 }],
  findingCount: 3,
  rulesetVersion: "abc123def456",
};

describe("readHistory", () => {
  it("returns an empty result with no warnings when the file doesn't exist", async () => {
    const repo = await createTempDir("history-missing");
    try {
      const result = await readHistory(repo.path);
      expect(result).toEqual({ entries: [], warnings: [] });
    } finally {
      await repo.cleanup();
    }
  });

  it("reads back previously written entries in order", async () => {
    const repo = await createTempDir("history-roundtrip");
    try {
      await repo.write(".pickcheck/history.json", JSON.stringify([sampleEntry]));
      const result = await readHistory(repo.path);
      expect(result).toEqual({ entries: [sampleEntry], warnings: [] });
    } finally {
      await repo.cleanup();
    }
  });

  it("warns and treats the file as empty on invalid JSON", async () => {
    const repo = await createTempDir("history-invalid-json");
    try {
      await repo.write(".pickcheck/history.json", "{not valid json");
      const result = await readHistory(repo.path);
      expect(result.entries).toEqual([]);
      expect(result.warnings).toEqual([expect.stringContaining("not valid JSON")]);
    } finally {
      await repo.cleanup();
    }
  });

  it("warns and treats the file as empty when it isn't a JSON array", async () => {
    const repo = await createTempDir("history-not-array");
    try {
      await repo.write(".pickcheck/history.json", JSON.stringify({ oops: true }));
      const result = await readHistory(repo.path);
      expect(result.entries).toEqual([]);
      expect(result.warnings).toEqual([
        expect.stringContaining("does not contain a JSON array"),
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  it("skips malformed entries but keeps well-formed ones, with a warning per skip", async () => {
    const repo = await createTempDir("history-mixed");
    try {
      await repo.write(
        ".pickcheck/history.json",
        JSON.stringify([
          sampleEntry,
          { garbage: true },
          { ...sampleEntry, composite: 91 },
        ]),
      );
      const result = await readHistory(repo.path);
      expect(result.entries).toEqual([sampleEntry, { ...sampleEntry, composite: 91 }]);
      expect(result.warnings).toEqual([expect.stringContaining("index 1")]);
    } finally {
      await repo.cleanup();
    }
  });

  it("rejects an entry with an unrecognized category", async () => {
    const repo = await createTempDir("history-bad-category");
    try {
      await repo.write(
        ".pickcheck/history.json",
        JSON.stringify([
          { ...sampleEntry, categories: [{ category: "not-a-category", score: 10 }] },
        ]),
      );
      const result = await readHistory(repo.path);
      expect(result.entries).toEqual([]);
      expect(result.warnings).toHaveLength(1);
    } finally {
      await repo.cleanup();
    }
  });
});

describe("appendHistoryEntry", () => {
  it("creates .pickcheck/history.json when it doesn't exist yet", async () => {
    const repo = await createTempDir("history-create");
    try {
      const result = await appendHistoryEntry(repo.path, sampleEntry);
      expect(result.warnings).toEqual([]);

      const written = JSON.parse(
        await readFile(join(repo.path, ".pickcheck/history.json"), "utf-8"),
      );
      expect(written).toEqual([sampleEntry]);
    } finally {
      await repo.cleanup();
    }
  });

  it("appends to existing entries rather than overwriting them", async () => {
    const repo = await createTempDir("history-append");
    try {
      await appendHistoryEntry(repo.path, sampleEntry);
      await appendHistoryEntry(repo.path, { ...sampleEntry, composite: 95 });

      const { entries } = await readHistory(repo.path);
      expect(entries).toEqual([sampleEntry, { ...sampleEntry, composite: 95 }]);
    } finally {
      await repo.cleanup();
    }
  });

  it("caps history at the most recent entries once the limit is exceeded", async () => {
    const repo = await createTempDir("history-cap");
    try {
      for (let i = 0; i < 205; i++) {
        await appendHistoryEntry(repo.path, { ...sampleEntry, composite: i });
      }
      const { entries } = await readHistory(repo.path);
      expect(entries).toHaveLength(200);
      expect(entries[0]?.composite).toBe(5); // oldest 5 (indices 0-4) dropped
      expect(entries.at(-1)?.composite).toBe(204);
    } finally {
      await repo.cleanup();
    }
  }, 20000);
});

describe("computeRulesetFingerprint", () => {
  const baseRule: Rule = {
    id: "sec/no-secrets-in-code",
    category: "security",
    severity: "error",
    title: "Hardcoded secret",
    files: ["**/*.ts"],
    message: "A secret looks hardcoded.",
    weight: 4,
    tier: "exists",
    pattern: { mode: "absent" },
  };

  it("is stable for the same ruleset regardless of load order", () => {
    const otherRule: Rule = {
      ...baseRule,
      id: "disc/no-console-log",
      category: "discipline",
    };
    const a = computeRulesetFingerprint([baseRule, otherRule]);
    const b = computeRulesetFingerprint([otherRule, baseRule]);
    expect(a).toBe(b);
  });

  it("changes when a rule's severity changes", () => {
    const a = computeRulesetFingerprint([baseRule]);
    const b = computeRulesetFingerprint([{ ...baseRule, severity: "warn" }]);
    expect(a).not.toBe(b);
  });

  it("changes when a rule is added or removed", () => {
    const otherRule: Rule = {
      ...baseRule,
      id: "disc/no-console-log",
      category: "discipline",
    };
    const a = computeRulesetFingerprint([baseRule]);
    const b = computeRulesetFingerprint([baseRule, otherRule]);
    expect(a).not.toBe(b);
  });
});
