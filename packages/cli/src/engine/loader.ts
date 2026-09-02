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
 */
export async function loadRules(rulesDir: string): Promise<LoadRulesResult> {
  const files = await fg("**/rule.yaml", { cwd: rulesDir, absolute: true });
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
