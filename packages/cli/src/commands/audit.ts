import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { Command } from "commander";
import { runAudit } from "../engine/audit.js";
import { DEFAULT_MIN_SCORE, getExitCode } from "../engine/exit-code.js";
import { renderJson } from "../render/json.js";
import { renderQuietSummary, renderTerminal } from "../render/terminal.js";

/**
 * Where rule.yaml files ship: resolved via @pickcheck/rules' own
 * package.json rather than a relative path from this file, so it keeps
 * working regardless of how deeply tsup nests the built dist/ output —
 * see DECISIONS/0005.
 */
function defaultRulesDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve("@pickcheck/rules/package.json"));
}

export function registerAuditCommand(program: Command): void {
  program
    .command("audit")
    .description("Audit the current repo and print a scored report.")
    .option(
      "--json",
      "Print a machine-readable JSON report instead of the terminal one.",
    )
    .option(
      "--quiet",
      "Print a single CI-friendly summary line (score + counts) instead of the full report.",
    )
    .option(
      "--min <score>",
      "Minimum composite score (0-100) required to exit 0.",
      String(DEFAULT_MIN_SCORE),
    )
    .option(
      "--rules-dir <path>",
      "Directory to load rule.yaml files from (recursively).",
    )
    .action(
      async (options: {
        json?: boolean;
        quiet?: boolean;
        min: string;
        rulesDir?: string;
      }) => {
        const min = Number(options.min);
        if (!Number.isFinite(min)) {
          console.error(`--min expects a number, got "${options.min}"`);
          process.exitCode = 1;
          return;
        }

        const result = await runAudit({
          cwd: process.cwd(),
          rulesDir: options.rulesDir ?? defaultRulesDir(),
        });

        // --json is machine output: never mixed with --quiet's human summary.
        const report = options.json
          ? `${renderJson(result)}\n`
          : options.quiet
            ? renderQuietSummary(result)
            : renderTerminal(result);
        process.stdout.write(report);

        process.exitCode = getExitCode(result.score.composite, min);
      },
    );
}
