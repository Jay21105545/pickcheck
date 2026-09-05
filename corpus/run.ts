/**
 * Backtest corpus runner — EXECUTION.md's Stress-Test & Backtest Protocol,
 * item 2 ("Corpus regression: engine/rule changes re-run the corpus; any
 * findings diff must be explained in the PR description"), promoted from
 * a one-off manual run (DECISIONS/0014) into a repeatable script.
 *
 * This is dev-only tooling that clones real repos over the network — that
 * does NOT conflict with CLAUDE.md's "no network calls at runtime" (that
 * constraint is about the shipped `pickcheck audit` engine itself, which
 * this script doesn't touch; it only shells out to the already-built CLI
 * exactly like the root `self-audit` script does).
 *
 * Usage: `pnpm corpus` (diff mode) or `pnpm corpus -- --update` (accept the
 * current run's findings as the new committed baseline).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CorpusRepo {
  name: string;
  url: string;
  sha: string;
  category: "control" | "ai-generated";
  /**
   * Build stack, recorded so the corpus can be read as a 2x2 rather than a
   * single control/ai-generated axis. Before DECISIONS/0029 every control was
   * `next` and every ai-generated repo was `vite`, so the two fields were
   * perfectly correlated and no rule measured on this corpus could tell
   * "AI-written" from "Vite SPA".
   */
  stack: "next" | "vite";
  /** How the category was established — the marker, and the measured share of commits carrying it. */
  provenance: string;
  note: string;
}

interface Finding {
  ruleId: string;
  file: string;
  line?: number;
  severity: string;
  message: string;
  fixPrompt: string;
}

interface CategoryScore {
  category: string;
  score: number;
}

interface JsonReport {
  composite: number;
  categories: CategoryScore[];
  findings: Finding[];
  warnings: string[];
  fileCount: number;
  ruleCount: number;
  tokenSurface: unknown;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = join(ROOT, "corpus");
const CACHE_DIR = join(CORPUS_DIR, ".cache");
const SNAPSHOTS_DIR = join(CORPUS_DIR, "snapshots");
const CLI_ENTRY = join(ROOT, "packages/cli/dist/index.js");
const RULES_DIR = join(ROOT, "packages/rules");

const UPDATE = process.argv.includes("--update");

async function main(): Promise<void> {
  if (!existsSync(CLI_ENTRY)) {
    console.error(
      `${CLI_ENTRY} doesn't exist — run "pnpm --filter pickcheck run build" first (the root "corpus" script already does this).`,
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  // repos.json is committed, self-controlled data — trusted the same way
  // rule.yaml's *shape* is trusted by the engine's own tiers (zod
  // validates rule.yaml specifically because it accepts third-party rule
  // contributions; this file doesn't).
  const repos = JSON.parse(
    readFileSync(join(CORPUS_DIR, "repos.json"), "utf-8"),
  ) as CorpusRepo[];

  let anyDiff = false;
  let anyNewBaseline = false;

  for (const repo of repos) {
    console.log(`\n=== ${repo.name} (${repo.category}/${repo.stack}) ===`);

    let repoDir: string;
    try {
      repoDir = ensureCheckout(repo);
    } catch (error) {
      console.log(`  ERROR checking out: ${describeError(error)}`);
      continue;
    }

    let report: JsonReport;
    try {
      report = runAudit(repoDir);
    } catch (error) {
      console.log(`  ERROR running audit: ${describeError(error)}`);
      continue;
    }

    const snapshotPath = join(SNAPSHOTS_DIR, `${repo.name}.json`);

    if (UPDATE) {
      writeFileSync(snapshotPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(
        `  wrote snapshot (composite ${report.composite}, ${report.findings.length} findings)`,
      );
      continue;
    }

    if (!existsSync(snapshotPath)) {
      anyNewBaseline = true;
      console.log(
        `  no snapshot yet (composite ${report.composite}, ${report.findings.length} findings) — run with --update to seed it`,
      );
      continue;
    }

    // The snapshot was written by this same script — trusted the same way
    // the fresh `report` above is.
    const previous = JSON.parse(readFileSync(snapshotPath, "utf-8")) as JsonReport;
    const { added, removed } = diffFindings(previous.findings, report.findings);

    if (
      added.length === 0 &&
      removed.length === 0 &&
      previous.composite === report.composite
    ) {
      console.log(
        `  no change (composite ${report.composite}, ${report.findings.length} findings)`,
      );
      continue;
    }

    anyDiff = true;
    if (previous.composite !== report.composite) {
      console.log(`  composite: ${previous.composite} -> ${report.composite}`);
    }
    reportRuleDiff(added, removed);
  }

  if (UPDATE) {
    console.log("\nSnapshots updated.");
    return;
  }

  if (anyDiff) {
    console.log(
      "\nFindings diff detected against committed snapshots. If this change is intentional (a rule was added/tightened/pulled), review it and re-run with '--update' to accept the new baseline — and explain the diff in the PR description (CONTRIBUTING.md).",
    );
    process.exitCode = 1;
    return;
  }

  const suffix = anyNewBaseline
    ? " (some repos have no baseline yet — run with --update to seed them)"
    : "";
  console.log(`\nNo diff against committed snapshots.${suffix}`);
}

/** Shallow-fetches the pinned `repo.sha` exactly (GitHub supports fetching an arbitrary reachable commit, not just a branch tip) — reused if the cache already holds that exact commit. */
function ensureCheckout(repo: CorpusRepo): string {
  const dir = join(CACHE_DIR, repo.name);

  if (existsSync(join(dir, ".git"))) {
    const head = git(dir, ["rev-parse", "HEAD"]).trim();
    if (head === repo.sha) {
      return dir;
    }
    rmSync(dir, { recursive: true, force: true });
  }

  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"]);
  git(dir, ["remote", "add", "origin", repo.url]);
  git(dir, ["fetch", "--depth", "1", "origin", repo.sha]);
  git(dir, ["checkout", "-q", "FETCH_HEAD"]);
  return dir;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runAudit(repoDir: string): JsonReport {
  const output = execFileSync(
    process.execPath,
    [CLI_ENTRY, "audit", "--json", "--rules-dir", RULES_DIR, "--min", "0"],
    { cwd: repoDir, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(output) as JsonReport;
}

function findingKey(finding: Finding): string {
  return `${finding.ruleId}::${finding.file}::${finding.line ?? ""}`;
}

function diffFindings(
  previous: Finding[],
  fresh: Finding[],
): { added: Finding[]; removed: Finding[] } {
  const previousByKey = new Map(
    previous.map((finding) => [findingKey(finding), finding]),
  );
  const freshByKey = new Map(fresh.map((finding) => [findingKey(finding), finding]));

  const added = [...freshByKey.entries()]
    .filter(([key]) => !previousByKey.has(key))
    .map(([, finding]) => finding);
  const removed = [...previousByKey.entries()]
    .filter(([key]) => !freshByKey.has(key))
    .map(([, finding]) => finding);

  return { added, removed };
}

function groupByRule(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = map.get(finding.ruleId) ?? [];
    list.push(finding);
    map.set(finding.ruleId, list);
  }
  return map;
}

function reportRuleDiff(added: Finding[], removed: Finding[]): void {
  const addedByRule = groupByRule(added);
  const removedByRule = groupByRule(removed);
  const ruleIds = [...new Set([...addedByRule.keys(), ...removedByRule.keys()])].sort();

  for (const ruleId of ruleIds) {
    const a = addedByRule.get(ruleId) ?? [];
    const r = removedByRule.get(ruleId) ?? [];
    console.log(`  ${ruleId}: +${a.length} -${r.length}`);
    for (const finding of a) {
      console.log(`    + ${location(finding)}`);
    }
    for (const finding of r) {
      console.log(`    - ${location(finding)}`);
    }
  }
}

function location(finding: Finding): string {
  return finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as NodeJS.ErrnoException & { stderr?: Buffer | string })
      .stderr;
    const detail = stderr ? ` — ${stderr.toString().trim()}` : "";
    return `${error.message}${detail}`;
  }
  return String(error);
}

await main();
