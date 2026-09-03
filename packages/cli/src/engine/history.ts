import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CATEGORIES } from "@pickcheck/rules/schema";
import type { CategoryScore } from "./scorer.js";
import type { Rule } from "./types.js";

/** Relative to the audited repo's cwd, same as every other .pickcheck/ artifact. */
const HISTORY_RELATIVE_PATH = join(".pickcheck", "history.json");

/**
 * Bounds how large .pickcheck/history.json (and the report's embedded
 * sparkline) can grow — old entries age out from the front once a repo has
 * been audited this many times. Generous enough that no realistic project
 * hits it in normal day-to-day use.
 */
const MAX_HISTORY_ENTRIES = 200;

export interface HistoryEntry {
  /** ISO timestamp of the audit run. */
  timestamp: string;
  composite: number;
  categories: CategoryScore[];
  findingCount: number;
  /** computeRulesetFingerprint() output for the ruleset that produced this run — see its own doc comment. */
  rulesetVersion: string;
}

export interface ReadHistoryResult {
  /** Chronological, oldest first. Empty (never a warning) when the file doesn't exist yet — a repo's first audit. */
  entries: HistoryEntry[];
  warnings: string[];
}

/**
 * Reads .pickcheck/history.json. Same "never crash, warn and continue"
 * contract as loadRules() for a malformed rule.yaml: a missing file is the
 * normal first-run case (no warning), but a present-and-unreadable or
 * invalid one is reported as a warning and treated as empty rather than
 * failing the audit.
 */
export async function readHistory(cwd: string): Promise<ReadHistoryResult> {
  const path = join(cwd, HISTORY_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isEnoent(error)) {
      return { entries: [], warnings: [] };
    }
    return {
      entries: [],
      warnings: [
        `history: could not read ${HISTORY_RELATIVE_PATH} (${describeError(error)})`,
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      entries: [],
      warnings: [
        `history: ${HISTORY_RELATIVE_PATH} is not valid JSON (${describeError(error)}) — ignoring`,
      ],
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      entries: [],
      warnings: [
        `history: ${HISTORY_RELATIVE_PATH} does not contain a JSON array — ignoring`,
      ],
    };
  }

  const entries: HistoryEntry[] = [];
  const warnings: string[] = [];
  parsed.forEach((item, index) => {
    const entry = coerceEntry(item);
    if (entry === undefined) {
      warnings.push(
        `history: skipping malformed entry at index ${index} in ${HISTORY_RELATIVE_PATH}`,
      );
      return;
    }
    entries.push(entry);
  });

  return { entries, warnings };
}

/** Appends one entry and rewrites the file, capped at MAX_HISTORY_ENTRIES (oldest dropped first). */
export async function appendHistoryEntry(
  cwd: string,
  entry: HistoryEntry,
): Promise<{ warnings: string[] }> {
  const { entries, warnings } = await readHistory(cwd);
  const next = [...entries, entry].slice(-MAX_HISTORY_ENTRIES);
  const path = join(cwd, HISTORY_RELATIVE_PATH);

  try {
    await mkdir(join(cwd, ".pickcheck"), { recursive: true });
    await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  } catch (error) {
    return {
      warnings: [
        ...warnings,
        `history: could not write ${HISTORY_RELATIVE_PATH} (${describeError(error)})`,
      ],
    };
  }

  return { warnings };
}

/**
 * A content fingerprint of the loaded ruleset (not @pickcheck/rules'
 * package.json version, which is hand-bumped and can lag behind actual
 * rule.yaml edits) — changes automatically whenever a rule is added,
 * removed, or has its id/severity/weight/tier changed, which is exactly
 * what determines whether two runs' scores are a fair comparison. Order-
 * independent (sorted before hashing) so loader.ts's directory-walk order
 * can't perturb it. See DECISIONS/0019.
 */
export function computeRulesetFingerprint(rules: Rule[]): string {
  const signature = [...rules]
    .map((rule) => `${rule.id}@${rule.severity}@${rule.weight}@${rule.tier}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(signature).digest("hex").slice(0, 12);
}

function coerceEntry(value: unknown): HistoryEntry | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.timestamp !== "string" ||
    typeof record.composite !== "number" ||
    typeof record.findingCount !== "number" ||
    typeof record.rulesetVersion !== "string" ||
    !Array.isArray(record.categories)
  ) {
    return undefined;
  }

  const categories: CategoryScore[] = [];
  for (const raw of record.categories) {
    const category = coerceCategoryScore(raw);
    if (category === undefined) {
      return undefined;
    }
    categories.push(category);
  }

  return {
    timestamp: record.timestamp,
    composite: record.composite,
    findingCount: record.findingCount,
    rulesetVersion: record.rulesetVersion,
    categories,
  };
}

function coerceCategoryScore(value: unknown): CategoryScore | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const category = record.category;
  if (
    typeof category !== "string" ||
    !(CATEGORIES as readonly string[]).includes(category) ||
    typeof record.score !== "number"
  ) {
    return undefined;
  }
  return { category, score: record.score } as CategoryScore;
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
