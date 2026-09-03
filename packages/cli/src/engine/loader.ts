import { readFile } from "node:fs/promises";
import { ruleSchema } from "@pickcheck/rules/schema";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import type { Rule } from "./types.js";

export interface LoadRulesResult {
  rules: Rule[];
  warnings: string[];
}

/**
 * Reads every rule.yaml under `rulesDir`, validating each against
 * ruleSchema. An invalid or unparsable rule.yaml is never fatal — per
 * CLAUDE.md's error philosophy, it's logged as a warning and skipped so one
 * bad rule can't crash the audit.
 *
 * `_incubating/` is excluded: a parked rule whose current implementation is
 * known to be too imprecise to ship (DECISIONS/0014 is the first case —
 * `ux/hardcoded-px-width`'s regex tier). It keeps its rule.yaml, README,
 * and fixtures — the fixture test harness still validates it, since a
 * parked rule with broken fixtures would be useless to whoever resumes it
 * — it's just never loaded into a live audit.
 */
export async function loadRules(rulesDir: string): Promise<LoadRulesResult> {
  const files = await fg("**/rule.yaml", {
    cwd: rulesDir,
    absolute: true,
    ignore: ["**/_incubating/**"],
  });
  const rules: Rule[] = [];
  const warnings: string[] = [];

  for (const file of files.sort()) {
    let raw: string;
    try {
      raw = await readFile(file, "utf-8");
    } catch (error) {
      warnings.push(`Skipping ${file}: could not read file (${describeError(error)})`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (error) {
      warnings.push(`Skipping ${file}: invalid YAML (${describeError(error)})`);
      continue;
    }

    const result = ruleSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ");
      warnings.push(`Skipping ${file}: schema validation failed (${issues})`);
      continue;
    }

    rules.push(result.data);
  }

  return { rules, warnings };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
