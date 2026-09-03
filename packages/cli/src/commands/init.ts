import type { Command } from "commander";
import type { Assistant, InitResult } from "../engine/init.js";
import { runInit } from "../engine/init.js";

const DEFAULT_MIN_SCORE = 60;
const ASSISTANT_VALUES: Assistant[] = ["claude", "agents"];

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description(
      "Scaffold a docs-kit (CHANGELOG, API.md, ARCHITECTURE.md, DECISIONS/, CONTRIBUTING.md, PR template, .env.example), AI assistant conventions file(s), and a CI audit gate into this repo. Never overwrites an existing file.",
    )
    .option("-y, --yes", "Skip prompts and use defaults (non-interactive).")
    .option(
      "--min <score>",
      "Minimum composite score baked into the generated CI gate workflow.",
      String(DEFAULT_MIN_SCORE),
    )
    .option(
      "--assistants <list>",
      "Comma-separated AI assistant conventions files to write: claude, agents, or both.",
      "claude,agents",
    )
    .action(async (options: { yes?: boolean; min: string; assistants: string }) => {
      // Same "must be scriptable" reasoning as --quiet on `audit`: CI and
      // pickcheck's own tests can't drive a real TTY prompt loop, so a
      // missing TTY behaves like --yes rather than hanging. @clack/prompts
      // itself is only imported on the interactive path — see ADR 0010.
      const interactive = options.yes !== true && process.stdin.isTTY === true;

      let assistants = parseAssistants(options.assistants);
      let minScore = Number(options.min);

      if (interactive) {
        const answered = await promptInteractively(assistants, minScore);
        if (answered === null) {
          process.exitCode = 1;
          return;
        }
        assistants = answered.assistants;
        minScore = answered.minScore;
      }

      if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
        console.error(`--min expects a number between 0 and 100, got "${options.min}"`);
        process.exitCode = 1;
        return;
      }

      const result = await runInit({ cwd: process.cwd(), assistants, minScore });

      if (interactive) {
        const p = await import("@clack/prompts");
        p.outro(formatSummary(result));
      } else {
        // process.stdout.write, not console.log — disc/no-console-log
        // flags the latter, and this codebase eats its own audit
        // (CLAUDE.md).
        process.stdout.write(`${formatSummary(result)}\n`);
      }
    });
}

async function promptInteractively(
  defaultAssistants: Assistant[],
  defaultMinScore: number,
): Promise<{ assistants: Assistant[]; minScore: number } | null> {
  const p = await import("@clack/prompts");
  p.intro("pickcheck init");

  const assistantsAnswer = await p.multiselect<Assistant>({
    message: "Which AI assistant conventions file(s) should pickcheck write?",
    options: [
      { value: "claude", label: "CLAUDE.md" },
      { value: "agents", label: "AGENTS.md" },
    ],
    initialValues: defaultAssistants,
    required: false,
  });
  if (p.isCancel(assistantsAnswer)) {
    p.cancel("Cancelled — nothing written.");
    return null;
  }

  const minAnswer = await p.text({
    message: "Minimum composite score for the CI gate (audit --min)?",
    initialValue: String(defaultMinScore),
    validate: (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 && n <= 100
        ? undefined
        : "Enter a number between 0 and 100.";
    },
  });
  if (p.isCancel(minAnswer)) {
    p.cancel("Cancelled — nothing written.");
    return null;
  }

  return { assistants: assistantsAnswer, minScore: Number(minAnswer) };
}

function parseAssistants(raw: string): Assistant[] {
  const values = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Assistant =>
      (ASSISTANT_VALUES as string[]).includes(value),
    );
  return values.length > 0 ? [...new Set(values)] : ASSISTANT_VALUES;
}

function formatSummary(result: InitResult): string {
  const lines: string[] = [
    `Detected: ${result.stack.ecosystem}/${result.stack.framework}`,
  ];

  if (result.created.length > 0) {
    lines.push("Created:", ...result.created.map((file) => `  + ${file}`));
  }
  if (result.skipped.length > 0) {
    lines.push(
      "Skipped (already exist):",
      ...result.skipped.map((file) => `  - ${file}`),
    );
  }
  if (result.created.length === 0) {
    lines.push("Nothing to do — every docs-kit file already exists.");
  }

  return lines.join("\n");
}
