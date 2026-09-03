import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { generatorsDir } from "../../util/repo-paths.js";
import { detectStack } from "../detect.js";
import { renderTemplate } from "./template.js";

export class NoApiSurfaceError extends Error {
  constructor() {
    super(
      "No API surface detected (app/api/**, pages/api/**, routes/**, or an Express/Fastify/FastAPI/Flask entry file).",
    );
    this.name = "NoApiSurfaceError";
  }
}

export interface GenApiOptions {
  /** Repo root to read routes from and write pickcheck-prompt.md into. */
  cwd: string;
}

export interface GenApiResult {
  outputPath: string;
  prompt: string;
  apiFiles: string[];
}

/**
 * Embeds every detected API route's real source into `generators/api.md`'s
 * prompt template and writes the result to `pickcheck-prompt.md` — no LLM
 * calls, per ADR 0002. The user pastes the output into their own assistant.
 */
export async function generateApiPrompt(options: GenApiOptions): Promise<GenApiResult> {
  const stack = await detectStack(options.cwd);
  if (stack.apiFiles.length === 0) {
    throw new NoApiSurfaceError();
  }

  const routeSections = await Promise.all(
    stack.apiFiles.map(async (file) => {
      const content = await readFile(join(options.cwd, file), "utf-8");
      return `### ${file}\n\n\`\`\`${languageFor(file)}\n${content.trimEnd()}\n\`\`\`\n`;
    }),
  );

  const template = await readFile(join(generatorsDir(), "api.md"), "utf-8");
  const prompt = renderTemplate(template, {
    PROJECT_NAME: stack.projectName,
    FRAMEWORK: stack.framework,
    ROUTE_COUNT: String(stack.apiFiles.length),
    ROUTES: routeSections.join("\n"),
  });

  const outputPath = join(options.cwd, "pickcheck-prompt.md");
  await writeFile(outputPath, prompt, "utf-8");

  return { outputPath, prompt, apiFiles: stack.apiFiles };
}

function languageFor(file: string): string {
  const ext = extname(file).slice(1);
  return ext === "mjs" || ext === "cjs" ? "js" : ext || "text";
}
