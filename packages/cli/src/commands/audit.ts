import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type { Command } from "commander";
import { runAudit } from "../engine/audit.js";
import { DEFAULT_MIN_SCORE, getExitCode } from "../engine/exit-code.js";
import {
  appendHistoryEntry,
  computeRulesetFingerprint,
  readHistory,
} from "../engine/history.js";
import { renderJson } from "../render/json.js";
import { renderQuietSummary, renderTerminal } from "../render/terminal.js";

/** Default path (relative to the audited repo's cwd) `--report` writes to when passed without a value. */
const DEFAULT_REPORT_PATH = ".pickcheck/report.html";

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
    .option(
      "--report [path]",
      `Write a self-contained HTML report (default: ${DEFAULT_REPORT_PATH}). Pass a path to override it.`,
    )
    .action(
      async (options: {
        json?: boolean;
        quiet?: boolean;
        min: string;
        rulesDir?: string;
        report?: string | true;
      }) => {
        const min = Number(options.min);
        if (!Number.isFinite(min)) {
          console.error(`--min expects a number, got "${options.min}"`);
          process.exitCode = 1;
          return;
        }

        const cwd = process.cwd();
        const generatedAt = new Date();

        // Read before this run's history entry is appended below, so the
        // report (and the trend line inside it) only ever sees prior runs.
        const previousHistory = await readHistory(cwd);

        const result = await runAudit({
          cwd,
          rulesDir: options.rulesDir ?? defaultRulesDir(),
        });

        let reportPath: string | undefined;
        const reportWarnings: string[] = [];
        if (options.report !== undefined) {
          const requestedPath =
            options.report === true ? DEFAULT_REPORT_PATH : options.report;
          const absolutePath = isAbsolute(requestedPath)
            ? requestedPath
            : join(cwd, requestedPath);
          try {
            const { buildReportHtml } = await import("../render/html.js");
            const repoName = await resolveRepoName(cwd);
            const html = await buildReportHtml(result, {
              cwd,
              repoName,
              generatedAt,
              history: previousHistory.entries,
            });
            await mkdir(dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, html, "utf-8");
            reportPath = relative(cwd, absolutePath) || requestedPath;
          } catch (error) {
            reportWarnings.push(
              `report: could not write ${requestedPath} (${error instanceof Error ? error.message : String(error)})`,
            );
          }
        }

        // "Append each run" (EXECUTION.md Phase 3) — history tracking isn't
        // gated behind --report, so a trend is already available the first
        // time someone does pass it.
        const appendResult = await appendHistoryEntry(cwd, {
          timestamp: generatedAt.toISOString(),
          composite: result.score.composite,
          categories: result.score.categories,
          findingCount: result.findings.length,
          rulesetVersion: computeRulesetFingerprint(result.rules),
        });

        const finalResult = {
          ...result,
          warnings: [
            ...previousHistory.warnings,
            ...result.warnings,
            ...reportWarnings,
            ...appendResult.warnings,
          ],
        };

        // --json is machine output: never mixed with --quiet's human summary.
        // exactOptionalPropertyTypes: only include the key when there's a
        // path, matching TerminalRenderOptions.reportPath's optional shape.
        const renderOptions = reportPath === undefined ? {} : { reportPath };
        const report = options.json
          ? `${renderJson(finalResult, reportPath)}\n`
          : options.quiet
            ? renderQuietSummary(finalResult, renderOptions)
            : renderTerminal(finalResult, renderOptions);
        process.stdout.write(report);

        process.exitCode = getExitCode(finalResult.score.composite, min);
      },
    );
}

/** Best-effort repo display name for the report's hero: package.json's `name`, else the directory name. */
async function resolveRepoName(cwd: string): Promise<string> {
  const packageName = await tryReadPackageName(cwd);
  return packageName ?? basename(cwd);
}

async function tryReadPackageName(cwd: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(cwd, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === "string" && parsed.name.length > 0
      ? parsed.name
      : undefined;
  } catch {
    return undefined;
  }
}
