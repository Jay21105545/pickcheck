import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { generatorsDir } from "../../util/repo-paths.js";
import { renderTemplate } from "./template.js";

const execFileAsync = promisify(execFile);

export class NoCommitsFoundError extends Error {
  constructor() {
    super("No git commits found — is this a git repository with at least one commit?");
    this.name = "NoCommitsFoundError";
  }
}

const CONVENTIONAL_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

const SUBJECT_PATTERN = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/;

export interface GenChangelogOptions {
  /** Repo root to read git log from and write pickcheck-prompt.md into. */
  cwd: string;
  /** Most commits to include when there's no tag to scope the range to. */
  maxCommits?: number;
}

export interface GenChangelogResult {
  outputPath: string;
  prompt: string;
  commitCount: number;
}

/**
 * Groups git log by conventional commit type and embeds it into
 * `generators/changelog.md`'s prompt template, writing the result to
 * `pickcheck-prompt.md` — no LLM calls, per ADR 0002.
 */
export async function generateChangelogPrompt(
  options: GenChangelogOptions,
): Promise<GenChangelogResult> {
  const subjects = await getCommitSubjects(options.cwd, options.maxCommits ?? 200);
  if (subjects.length === 0) {
    throw new NoCommitsFoundError();
  }

  const grouped = groupByConventionalType(subjects);
  const template = await readFile(join(generatorsDir(), "changelog.md"), "utf-8");
  const prompt = renderTemplate(template, {
    PROJECT_NAME: basename(options.cwd),
    COMMIT_COUNT: String(subjects.length),
    COMMIT_GROUPS: formatGroups(grouped),
  });

  const outputPath = join(options.cwd, "pickcheck-prompt.md");
  await writeFile(outputPath, prompt, "utf-8");

  return { outputPath, prompt, commitCount: subjects.length };
}

async function getCommitSubjects(cwd: string, maxCommits: number): Promise<string[]> {
  const lastTag = await execFileAsync("git", ["describe", "--tags", "--abbrev=0"], {
    cwd,
  }).then(
    (result) => result.stdout.trim(),
    () => null,
  );

  const range = lastTag !== null && lastTag !== "" ? [`${lastTag}..HEAD`] : [];
  const args = [
    "log",
    "--no-merges",
    "-n",
    String(maxCommits),
    "--pretty=format:%s",
    ...range,
  ];

  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function groupByConventionalType(subjects: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const subject of subjects) {
    const match = SUBJECT_PATTERN.exec(subject);
    const rawType = match?.[1] ?? "";
    const isKnownType = (CONVENTIONAL_TYPES as readonly string[]).includes(rawType);
    const type = isKnownType ? rawType : "other";
    const description = isKnownType ? (match?.[2] ?? subject) : subject;

    const list = groups.get(type) ?? [];
    list.push(description);
    groups.set(type, list);
  }

  return groups;
}

function formatGroups(groups: Map<string, string[]>): string {
  const sections: string[] = [];

  for (const type of [...CONVENTIONAL_TYPES, "other"]) {
    const items = groups.get(type);
    if (items === undefined || items.length === 0) {
      continue;
    }
    sections.push(
      `**${type}** (${items.length}):\n${items.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
