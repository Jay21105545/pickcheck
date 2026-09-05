import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CoverageRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import { stripComments } from "../strip-comments.js";
import type { TierContext, TierResult } from "./types.js";

/**
 * Set-coverage between two extracted identifier sets: the identifiers the
 * code *uses* (from files matching `rule.files`) versus the identifiers a
 * documentation file *declares* (from files matching
 * `pattern.declaredIn.files`). Below `pattern.threshold`, that's one
 * finding — reported against the declaration file, because that's the file
 * that has to change.
 *
 * One finding per rule run, never one per undeclared identifier. Fifteen
 * separate findings saying "add a key to .env.example" is fifteen copies
 * of one instruction; the missing names go in the fix-prompt detail
 * instead, where they're actionable in a single edit.
 *
 * Applicability follows the same rule every content tier uses (see
 * ARCHITECTURE.md): the rule is applicable only if `rule.files` matched at
 * least one scanned file. A repo whose code reads no identifiers at all
 * produces no finding *and* no applicability — there is nothing to
 * document, so a missing declaration file is not a defect.
 */
export async function runCoverageTier(
  rule: CoverageRule,
  ctx: TierContext,
): Promise<TierResult> {
  const sourceFiles = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  if (sourceFiles.length === 0) {
    return { findings: [], warnings: [] };
  }

  const warnings: string[] = [];
  const usedRegex = globalize(rule.pattern.regex, rule.pattern.flags);
  const optionalRegex =
    rule.pattern.optionalRegex === undefined
      ? undefined
      : globalize(rule.pattern.optionalRegex, rule.pattern.optionalFlags);

  const used = new Set<string>();
  const optional = new Set<string>();

  for (const file of sourceFiles) {
    const raw = await tryRead(join(ctx.cwd, file), rule.id, warnings);
    if (raw === undefined) {
      continue;
    }
    // Comments are stripped from *source* only, never from the declaration
    // file below — a `#`-commented key in a .env.example is a deliberate
    // way to document an optional setting, not noise to discard.
    const content = stripComments(raw);
    collectInto(used, content, usedRegex);
    if (optionalRegex !== undefined) {
      collectInto(optional, content, optionalRegex);
    }
  }

  // An identifier is *required* when it's used, isn't platform-supplied,
  // and the code never treats its absence as acceptable. `optional` is
  // repo-wide on purpose: one guarded reference anywhere is the author
  // saying this value may legitimately be unset, and that's true no matter
  // how many other places read it unguarded.
  const required = [...used].filter(
    (name) => !optional.has(name) && !isIgnored(name, rule.pattern.ignore),
  );
  if (required.length === 0) {
    return { findings: [], warnings };
  }

  const declaredFiles = micromatch(ctx.scannedFiles, rule.pattern.declaredIn.files, {
    dot: true,
  });
  const declaredRegex = globalize(
    rule.pattern.declaredIn.regex,
    rule.pattern.declaredIn.flags,
  );
  const declared = new Set<string>();
  for (const file of declaredFiles) {
    const content = await tryRead(join(ctx.cwd, file), rule.id, warnings);
    if (content !== undefined) {
      collectInto(declared, content, declaredRegex);
    }
  }

  const missing = required.filter((name) => !declared.has(name)).sort();
  const coverage = (required.length - missing.length) / required.length;
  if (coverage >= rule.pattern.threshold) {
    return { findings: [], warnings };
  }

  // Report against the declaration file that exists, or — when none does —
  // the first path the rule expects, so the message names a file the user
  // can create.
  const [fallback] = rule.pattern.declaredIn.files;
  const target = declaredFiles[0] ?? fallback;
  if (target === undefined) {
    // Unreachable: the schema requires declaredIn.files.length >= 1.
    return { findings: [], warnings };
  }

  return {
    findings: [
      {
        ruleId: rule.id,
        file: target,
        severity: rule.severity,
        message: rule.message,
        fixPrompt: buildFixPrompt(
          rule,
          target,
          undefined,
          `${Math.round(coverage * 100)}% documented (${required.length - missing.length}/${required.length}), threshold ${Math.round(rule.pattern.threshold * 100)}% — missing: ${missing.join(", ")}`,
        ),
      },
    ],
    warnings,
  };
}

/**
 * Adds every identifier `regex` matches in `content` to `target`. Takes
 * the first capture group that participated in the match, so a rule can
 * write one alternation branch per access syntax with its own group
 * instead of threading a single group through all of them.
 */
function collectInto(target: Set<string>, content: string, regex: RegExp): void {
  regex.lastIndex = 0;
  for (const match of content.matchAll(regex)) {
    const name = match.slice(1).find((group) => group !== undefined);
    if (name !== undefined && name !== "") {
      target.add(name);
    }
  }
}

/** Whether `name` is exempt — an `ignore` entry ending in `*` matches any identifier with that prefix. */
function isIgnored(name: string, ignore: string[]): boolean {
  return ignore.some((entry) =>
    entry.endsWith("*") ? name.startsWith(entry.slice(0, -1)) : name === entry,
  );
}

/** `matchAll` throws on a non-global regex, and every use here is a whole-content sweep. */
function globalize(source: string, flags: string | undefined): RegExp {
  const resolved = flags ?? "";
  return new RegExp(source, resolved.includes("g") ? resolved : `${resolved}g`);
}

async function tryRead(
  path: string,
  ruleId: string,
  warnings: string[],
): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch (error) {
    warnings.push(
      `${ruleId}: could not read ${path} (${error instanceof Error ? error.message : String(error)})`,
    );
    return undefined;
  }
}
