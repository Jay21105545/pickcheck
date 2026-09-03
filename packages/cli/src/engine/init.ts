import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { docsKitDir } from "../util/repo-paths.js";
import type { DetectedStack } from "./detect.js";
import { detectStack } from "./detect.js";
import { renderTemplate } from "./generators/template.js";

export type Assistant = "claude" | "agents";

export interface InitOptions {
  /** Repo root to scaffold into. */
  cwd: string;
  /** Which AI assistant conventions file(s) to write. */
  assistants: Assistant[];
  /** Baked into the generated CI gate workflow's `audit --min`. */
  minScore: number;
}

export interface InitResult {
  stack: DetectedStack;
  /** Relative paths written. */
  created: string[];
  /** Relative paths left untouched because they already existed. */
  skipped: string[];
}

interface PlanItem {
  relativePath: string;
  content: () => Promise<string>;
}

// [source under docs-kit/, destination relative to the target repo] — the
// destination differs from the source layout for the two GitHub-specific
// files, since docs-kit/ keeps everything flat for easy browsing/editing.
const STATIC_DOCS_KIT_FILES: Array<[source: string, destination: string]> = [
  ["CHANGELOG.md", "CHANGELOG.md"],
  ["API.md", "API.md"],
  ["ARCHITECTURE.md", "ARCHITECTURE.md"],
  ["CONTRIBUTING.md", "CONTRIBUTING.md"],
  ["PULL_REQUEST_TEMPLATE.md", ".github/PULL_REQUEST_TEMPLATE.md"],
  [
    "DECISIONS/0001-record-architecture-decisions.md",
    "DECISIONS/0001-record-architecture-decisions.md",
  ],
  ["workflows/pickcheck.yml", ".github/workflows/pickcheck.yml"],
];

/**
 * Scaffolds the docs-kit, AI assistant conventions file(s), and a CI audit
 * gate into `options.cwd`. Never overwrites an existing file — each
 * candidate path is checked first and skipped (not written) if present, so
 * running `init` twice, or against a repo that already has some of these
 * files, is always safe.
 */
export async function runInit(options: InitOptions): Promise<InitResult> {
  const stack = await detectStack(options.cwd);
  const items = buildPlan(options, stack);

  const created: string[] = [];
  const skipped: string[] = [];

  for (const item of items) {
    const targetPath = join(options.cwd, item.relativePath);
    if (await pathExists(targetPath)) {
      skipped.push(item.relativePath);
      continue;
    }
    const content = await item.content();
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf-8");
    created.push(item.relativePath);
  }

  return { stack, created: created.sort(), skipped: skipped.sort() };
}

function buildPlan(options: InitOptions, stack: DetectedStack): PlanItem[] {
  const vars: Record<string, string> = {
    PROJECT_NAME: stack.projectName,
    ECOSYSTEM: stack.ecosystem,
    FRAMEWORK: stack.framework,
    PACKAGE_MANAGER: stack.packageManager ?? "n/a",
    INSTALL_CMD: stack.installCmd,
    TEST_CMD: stack.testCmd,
    LINT_CMD: stack.lintCmd,
    MIN_SCORE: String(options.minScore),
  };

  const items: PlanItem[] = STATIC_DOCS_KIT_FILES.map(([source, destination]) => ({
    relativePath: destination,
    content: async () =>
      renderTemplate(await readFile(join(docsKitDir(), source), "utf-8"), vars),
  }));

  items.push({
    relativePath: ".env.example",
    content: async () => buildEnvExample(options.cwd, stack.envFiles),
  });

  for (const assistant of options.assistants) {
    const relativePath = assistant === "claude" ? "CLAUDE.md" : "AGENTS.md";
    items.push({
      relativePath,
      content: async () => buildConventionsFile(stack, relativePath),
    });
  }

  return items;
}

const ENV_KEY_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

async function buildEnvExample(cwd: string, envFiles: string[]): Promise<string> {
  const keys = new Set<string>();
  for (const file of envFiles) {
    const raw = await readFile(join(cwd, file), "utf-8").catch(() => "");
    for (const line of raw.split("\n")) {
      const match = ENV_KEY_PATTERN.exec(line);
      if (match?.[1] !== undefined) {
        keys.add(match[1]);
      }
    }
  }

  if (keys.size === 0) {
    return (
      "# No environment variables detected yet.\n" +
      "# Add each variable your app reads from process.env/os.environ here,\n" +
      "# with a placeholder value — never a real secret.\n"
    );
  }

  return `${[...keys]
    .sort()
    .map((key) => `${key}=`)
    .join("\n")}\n`;
}

function buildConventionsFile(stack: DetectedStack, fileName: string): string {
  return `# ${fileName} — ${stack.projectName}

Conventions for AI coding assistants working in this repo. Scaffolded by
\`pickcheck init\` — this is a starting point, not a contract; edit it as
real conventions emerge.

## Stack

- Ecosystem: ${stack.ecosystem}
- Framework: ${stack.framework}
- Package manager: ${stack.packageManager ?? "n/a"}
- Install: \`${stack.installCmd}\`
- Test: \`${stack.testCmd}\`
- Lint: \`${stack.lintCmd}\`

## Ground rules

- Read this file before making changes; keep it in sync with real
  conventions as the project evolves.
- Don't add a dependency without a good reason — check what's already
  installed first.
- Match existing code style; don't reformat unrelated code in a change.
- Run the test and lint commands above before considering a change done.
- Document API endpoints and non-obvious decisions as you add them —
  \`API.md\` and \`DECISIONS/\` are scaffolded and ready for content.

## Keeping this honest

Run \`npx pickcheck audit\` to check this repo against common AI-generated
code smells (secrets in source, empty catch blocks, missing docs,
unhandled fetches). This file and the rest of the docs-kit were scaffolded
by \`pickcheck init\` to give that audit something to pass.
`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
