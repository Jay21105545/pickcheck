import { relative } from "node:path";
import type { Command } from "commander";
import { generateApiPrompt, NoApiSurfaceError } from "../engine/generators/api.js";
import {
  generateChangelogPrompt,
  NoCommitsFoundError,
} from "../engine/generators/changelog.js";

// process.stdout.write, not console.log — disc/no-console-log flags the
// latter, and this codebase eats its own audit (CLAUDE.md).
function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function registerGenCommand(program: Command): void {
  const gen = program
    .command("gen")
    .description(
      "Generate a paste-ready prompt file (pickcheck-prompt.md) for your own AI assistant. No LLM calls are made — see DECISIONS/0002.",
    );

  gen
    .command("api")
    .description("Embed the detected API route code into a prompt that writes API.md.")
    .action(async () => {
      try {
        const result = await generateApiPrompt({ cwd: process.cwd() });
        print(
          `Found ${result.apiFiles.length} API file(s): ${result.apiFiles.join(", ")}`,
        );
        print(
          `Wrote ${relative(process.cwd(), result.outputPath)} — paste it into your assistant.`,
        );
      } catch (error) {
        if (error instanceof NoApiSurfaceError) {
          console.error(error.message);
          process.exitCode = 1;
          return;
        }
        throw error;
      }
    });

  gen
    .command("changelog")
    .description(
      "Group git log by conventional commit type into a prompt that writes a Keep a Changelog entry.",
    )
    .action(async () => {
      try {
        const result = await generateChangelogPrompt({ cwd: process.cwd() });
        print(`Grouped ${result.commitCount} commit(s).`);
        print(
          `Wrote ${relative(process.cwd(), result.outputPath)} — paste it into your assistant.`,
        );
      } catch (error) {
        if (error instanceof NoCommitsFoundError) {
          console.error(error.message);
          process.exitCode = 1;
          return;
        }
        throw error;
      }
    });
}
