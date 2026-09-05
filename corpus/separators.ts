/**
 * Separator analysis — the measurement half of DECISIONS/0029.
 *
 * `run.ts` answers "did the findings move?". This answers a different
 * question: for any signal that appears to tell AI-generated repos from
 * human-built ones, **is it detecting the generator, or the framework?**
 * Until DECISIONS/0029 the corpus could not answer that at all — every
 * control was Next.js and every AI-generated repo was a Lovable Vite SPA,
 * so `category` and `stack` were perfectly correlated and any separator
 * scored 100% on both axes at once.
 *
 * Two things get measured:
 *
 * 1. **Shipped rules**, read out of `snapshots/` — a 2x2 of how often each
 *    rule fires per cell, plus the generator/framework deltas.
 * 2. **Candidate detectors** (A-D), the four signals the recall report
 *    flagged as perfect separators. These are NOT rules and deliberately
 *    do not live in `packages/rules/` — they are measurement probes, run
 *    against the checkouts in `.cache/` so a candidate can be judged
 *    before anyone writes a `rule.yaml` for it.
 *
 * The number that matters for each detector is the **stratified** one: does
 * it still separate AI from control when you hold the stack fixed? A signal
 * whose framework delta rivals its generator delta is measuring the
 * template, not the provenance.
 *
 * Dev-only tooling. Reads the local checkouts `run.ts` already made; makes
 * no network calls of its own and never touches the shipped engine.
 *
 * Usage: `pnpm corpus:separators` (run `pnpm corpus` first to populate
 * `corpus/.cache/`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

interface CorpusRepo {
  name: string;
  url: string;
  sha: string;
  category: "control" | "ai-generated";
  stack: "next" | "vite";
  provenance: string;
  note: string;
}

interface Finding {
  ruleId: string;
  file: string;
  line?: number;
}

interface JsonReport {
  composite: number;
  findings: Finding[];
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = join(ROOT, "corpus");
const CACHE_DIR = join(CORPUS_DIR, ".cache");
const SNAPSHOTS_DIR = join(CORPUS_DIR, "snapshots");

const CELLS = [
  { category: "control", stack: "next" },
  { category: "control", stack: "vite" },
  { category: "ai-generated", stack: "next" },
  { category: "ai-generated", stack: "vite" },
] as const;

/* ------------------------------------------------------------------ *
 * JSONC
 * ------------------------------------------------------------------ */

/**
 * Strips `//` and comment blocks plus trailing commas, tracking string
 * literals so it does not eat them.
 *
 * The string-awareness is not pedantry. A naive comment regex run over a
 * Next.js `tsconfig.json` opens a "comment" at the `/*` inside
 * `"@/*": ["./*"]` and closes it at the `*​/` inside `"**​/*.ts"`, silently
 * deleting the middle of the file — which then fails to parse and reads as
 * "this repo has no tsconfig". Six of the thirteen corpus repos were
 * mismeasured that way before this was fixed.
 */
function stripJsonc(source: string): string {
  let out = "";
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < source.length) {
    const char = source[index] as string;

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (
        index + 1 < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }

    out += char;
    index += 1;
  }

  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Reads a JSON/JSONC file, or returns undefined if it is missing or unparseable. */
function readJsonc(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(stripJsonc(readFileSync(path, "utf-8")));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function readText(path: string): string {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf-8") : "";
}

/* ------------------------------------------------------------------ *
 * Detector A — TypeScript strictness
 * ------------------------------------------------------------------ */

/** Type-soundness flags: turning any of these off changes what the compiler accepts. */
const SOUNDNESS_FLAGS = ["strict", "noImplicitAny", "strictNullChecks"] as const;
/** Hygiene flags: off is a style choice, not a soundness hole. Measured separately on purpose. */
const HYGIENE_FLAGS = [
  "noUnusedLocals",
  "noUnusedParameters",
  "noImplicitThis",
  "strictFunctionTypes",
  "strictBindCallApply",
] as const;

interface StrictnessResult {
  configs: string[];
  flags: Record<string, boolean>;
  /** Soundness flags only. */
  lax: boolean;
  /** Soundness flags plus hygiene flags. */
  laxWide: boolean;
}

/**
 * Collects every tsconfig reachable from the root one.
 *
 * Both `extends` and `references` have to be followed or the measurement is
 * meaningless on half the corpus: the Vite + React template splits its
 * settings into `tsconfig.app.json` behind `references`, and `rowy` puts
 * its `paths` in a `tsconfig.extend.json` behind `extends`. Reading only
 * the root file sees an empty `compilerOptions` in both cases.
 */
function tsconfigChain(root: string): Array<[string, Record<string, unknown>]> {
  const seen = new Set<string>();
  const found: Array<[string, Record<string, unknown>]> = [];

  const walk = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const config = readJsonc(path);
    if (!config) return;
    found.push([relative(root, path), config]);

    const extendsField = config.extends;
    const parents = Array.isArray(extendsField)
      ? extendsField
      : typeof extendsField === "string"
        ? [extendsField]
        : [];
    for (const parent of parents) {
      // Only relative extends resolve without a node_modules install.
      if (typeof parent === "string" && parent.startsWith(".")) {
        walk(join(dirname(path), parent));
      }
    }

    const references = Array.isArray(config.references) ? config.references : [];
    for (const reference of references) {
      const referencePath =
        typeof reference === "object" && reference !== null
          ? (reference as { path?: unknown }).path
          : undefined;
      if (typeof referencePath !== "string") continue;
      const resolved = join(dirname(path), referencePath);
      walk(extname(resolved) === ".json" ? resolved : join(resolved, "tsconfig.json"));
    }
  };

  walk(join(root, "tsconfig.json"));
  return found;
}

function measureStrictness(root: string): StrictnessResult {
  const chain = tsconfigChain(root);
  const flags: Record<string, boolean> = {};

  // First writer wins: the root config's own value overrides what it extends,
  // which is how tsc resolves it too.
  for (const [, config] of chain) {
    const options = config.compilerOptions;
    if (typeof options !== "object" || options === null) continue;
    for (const [key, value] of Object.entries(options as Record<string, unknown>)) {
      const tracked = (
        [...SOUNDNESS_FLAGS, ...HYGIENE_FLAGS] as readonly string[]
      ).includes(key);
      if (tracked && typeof value === "boolean" && !(key in flags)) flags[key] = value;
    }
  }

  const lax =
    flags.strict !== true ||
    flags.noImplicitAny === false ||
    flags.strictNullChecks === false;
  const laxWide = lax || HYGIENE_FLAGS.some((flag) => flags[flag] === false);

  return { configs: chain.map(([path]) => path), flags, lax, laxWide };
}

/* ------------------------------------------------------------------ *
 * Detector B — does anything ever type-check this repo?
 * ------------------------------------------------------------------ */

/** `tsc` as a whole word (so `tsconfig` and `tsc-alias` do not match), `vue-tsc`, or a typecheck-named script. */
const TYPECHECK_PATTERN = /\btsc\b(?![-\w])|\bvue-tsc\b|\btype-?check\b/i;

interface TypecheckResult {
  scripts: string[];
  ciFiles: string[];
  workflowCount: number;
  nextConfigs: string[];
  ignoreBuildErrors: boolean;
  /** Literal reading: no typecheck script, no CI typecheck. */
  neverRuns: boolean;
  /** Same, but crediting `next build`'s implicit typecheck unless it is switched off. */
  neverRunsFrameworkAware: boolean;
}

function collectCiFiles(root: string): string[] {
  const files: string[] = [];
  for (const candidate of [".github/workflows", ".circleci", ".gitlab-ci.yml"]) {
    const path = join(root, candidate);
    if (!existsSync(path)) continue;
    if (statSync(path).isFile()) {
      files.push(path);
      continue;
    }
    for (const entry of readdirSync(path).sort()) {
      if (entry.endsWith(".yml") || entry.endsWith(".yaml"))
        files.push(join(path, entry));
    }
  }
  return files;
}

function measureTypecheck(root: string): TypecheckResult {
  const pkg = readJsonc(join(root, "package.json")) ?? {};
  const rawScripts = pkg.scripts;
  const scripts =
    typeof rawScripts === "object" && rawScripts !== null
      ? (rawScripts as Record<string, unknown>)
      : {};

  const scriptHits = Object.entries(scripts)
    .filter(
      ([name, body]) =>
        TYPECHECK_PATTERN.test(name) || TYPECHECK_PATTERN.test(String(body)),
    )
    .map(([name]) => name);

  const workflows = collectCiFiles(root);
  const ciHits = workflows
    .filter((file) => TYPECHECK_PATTERN.test(readText(file)))
    .map((file) => relative(root, file));

  const nextConfigs = ["next.config.mjs", "next.config.js", "next.config.ts"].filter(
    (file) => existsSync(join(root, file)),
  );
  const ignoreBuildErrors = nextConfigs.some((file) =>
    /ignoreBuildErrors\s*:\s*true/.test(readText(join(root, file))),
  );

  // `next build` type-checks by default; `vite build` never does. Reading a
  // missing `typecheck` script as a defect therefore convicts every Next.js
  // repo in the corpus, control and generated alike — see DECISIONS/0029.
  const implicitlyTypechecked = nextConfigs.length > 0 && !ignoreBuildErrors;
  const neverRuns = scriptHits.length === 0 && ciHits.length === 0;

  return {
    scripts: scriptHits,
    ciFiles: ciHits,
    workflowCount: workflows.length,
    nextConfigs,
    ignoreBuildErrors,
    neverRuns,
    neverRunsFrameworkAware: neverRuns && !implicitlyTypechecked,
  };
}

/* ------------------------------------------------------------------ *
 * Detector C — builder metadata left in the repo
 * ------------------------------------------------------------------ */

interface MarkerContext {
  root: string;
  packageName: string;
  packageJson: string;
  text: string;
}

const BUILDER_MARKERS: Array<[string, (context: MarkerContext) => boolean]> = [
  ["lovable-tagger dep", (c) => c.packageJson.includes("lovable-tagger")],
  ["gptengineer.js script", (c) => c.text.includes("gptengineer.js")],
  ["lovable.dev/.app url", (c) => /lovable\.(dev|app)/.test(c.text)],
  ["v0 sync readme line", (c) => /Automatically synced with your \[?v0/.test(c.text)],
  ["v0.dev/.app url", (c) => /v0\.(dev|app)/.test(c.text)],
  [".bolt/ directory", (c) => existsSync(join(c.root, ".bolt"))],
  [".replit file", (c) => existsSync(join(c.root, ".replit"))],
  [
    "unrenamed template package name",
    (c) => ["my-v0-project", "vite_react_shadcn_ts"].includes(c.packageName),
  ],
];

function measureBuilderMetadata(root: string): { markers: string[]; present: boolean } {
  const pkg = readJsonc(join(root, "package.json")) ?? {};
  const packageJson = readText(join(root, "package.json"));
  const text = ["README.md", "readme.md", "index.html", "package.json"]
    .map((file) => readText(join(root, file)))
    .join("\n");
  const context: MarkerContext = {
    root,
    packageName: typeof pkg.name === "string" ? pkg.name : "",
    packageJson,
    text,
  };
  const markers = BUILDER_MARKERS.filter(([, test]) => test(context)).map(
    ([name]) => name,
  );
  return { markers, present: markers.length > 0 };
}

/* ------------------------------------------------------------------ *
 * Detector D — `any` density
 * ------------------------------------------------------------------ */

const ANY_PATTERN =
  /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]|Record<[^>]*,\s*any>|Promise<any>|Array<any>/g;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  ".git",
]);

function measureAnyDensity(root: string): {
  count: number;
  lines: number;
  files: number;
  perKloc: number;
} {
  let count = 0;
  let lines = 0;
  let files = 0;

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
      const source = readText(join(dir, entry.name));
      files += 1;
      lines += source.split("\n").filter((line) => line.trim() !== "").length;
      count += source.match(ANY_PATTERN)?.length ?? 0;
    }
  };

  walk(root);
  return {
    count,
    lines,
    files,
    perKloc: lines === 0 ? 0 : Math.round(((1000 * count) / lines) * 100) / 100,
  };
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

interface Measured {
  repo: CorpusRepo;
  composite: number;
  ruleIds: Set<string>;
  strictness: StrictnessResult;
  typecheck: TypecheckResult;
  builder: { markers: string[]; present: boolean };
  anyDensity: { count: number; lines: number; files: number; perKloc: number };
}

function cellLabel(repo: CorpusRepo): string {
  return `${repo.category}/${repo.stack}`;
}

function ratio(hits: number, total: number): number {
  return total === 0 ? 0 : hits / total;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

/**
 * Prints one detector's 2x2 plus the two deltas and — the number that
 * actually decides ship/drop — the same comparison stratified by stack.
 */
function reportDetector(
  title: string,
  measured: Measured[],
  fires: (row: Measured) => boolean,
): void {
  console.log(`\n--- ${title} ---`);
  for (const cell of CELLS) {
    const rows = measured.filter(
      (row) => row.repo.category === cell.category && row.repo.stack === cell.stack,
    );
    console.log(
      `  ${`${cell.category}/${cell.stack}`.padEnd(20)} ${rows.filter(fires).length}/${rows.length}`,
    );
  }

  const ai = measured.filter((row) => row.repo.category === "ai-generated");
  const control = measured.filter((row) => row.repo.category === "control");
  const vite = measured.filter((row) => row.repo.stack === "vite");
  const next = measured.filter((row) => row.repo.stack === "next");

  const generatorDelta =
    ratio(ai.filter(fires).length, ai.length) -
    ratio(control.filter(fires).length, control.length);
  const frameworkDelta =
    ratio(vite.filter(fires).length, vite.length) -
    ratio(next.filter(fires).length, next.length);

  console.log(
    `  generator delta ${signed(generatorDelta)}  (AI ${ai.filter(fires).length}/${ai.length} vs control ${control.filter(fires).length}/${control.length})`,
  );
  console.log(
    `  framework delta ${signed(frameworkDelta)}  (vite ${vite.filter(fires).length}/${vite.length} vs next ${next.filter(fires).length}/${next.length})`,
  );

  for (const stack of ["next", "vite"] as const) {
    const stackAi = ai.filter((row) => row.repo.stack === stack);
    const stackControl = control.filter((row) => row.repo.stack === stack);
    console.log(
      `  within ${stack.padEnd(5)} AI ${stackAi.filter(fires).length}/${stackAi.length}  control ${stackControl.filter(fires).length}/${stackControl.length}`,
    );
  }

  const correct = measured.filter(
    (row) => fires(row) === (row.repo.category === "ai-generated"),
  ).length;
  console.log(
    `  accuracy as an AI-provenance classifier: ${Math.round((100 * correct) / measured.length)}% (${correct}/${measured.length})`,
  );
  if (Math.abs(frameworkDelta) >= Math.abs(generatorDelta)) {
    console.log(
      "  >> framework explains at least as much as generator — not a provenance signal",
    );
  }
}

function reportShippedRules(measured: Measured[]): void {
  console.log("\n=== shipped rules: which cells each one fires in ===");
  const ruleIds = [...new Set(measured.flatMap((row) => [...row.ruleIds]))].sort();
  console.log(
    `${"rule".padEnd(34)}${CELLS.map((c) => `${c.category.slice(0, 4)}/${c.stack}`.padEnd(12)).join("")}${"gen".padStart(7)}${"frame".padStart(8)}`,
  );
  console.log("-".repeat(97));

  for (const ruleId of ruleIds) {
    const fires = (row: Measured): boolean => row.ruleIds.has(ruleId);
    let line = ruleId.padEnd(34);
    for (const cell of CELLS) {
      const rows = measured.filter(
        (row) => row.repo.category === cell.category && row.repo.stack === cell.stack,
      );
      line += `${rows.filter(fires).length}/${rows.length}`.padEnd(12);
    }
    const ai = measured.filter((row) => row.repo.category === "ai-generated");
    const control = measured.filter((row) => row.repo.category === "control");
    const vite = measured.filter((row) => row.repo.stack === "vite");
    const next = measured.filter((row) => row.repo.stack === "next");
    const generatorDelta =
      ratio(ai.filter(fires).length, ai.length) -
      ratio(control.filter(fires).length, control.length);
    const frameworkDelta =
      ratio(vite.filter(fires).length, vite.length) -
      ratio(next.filter(fires).length, next.length);
    line += signed(generatorDelta).padStart(7) + signed(frameworkDelta).padStart(8);
    if (Math.abs(frameworkDelta) > Math.abs(generatorDelta))
      line += "  <- framework-dominant";
    console.log(line);
  }
}

function reportAnyDensitySweep(measured: Measured[]): void {
  console.log("\n--- D any-density: every threshold, and the best one available ---");
  const thresholds = [...new Set(measured.map((row) => row.anyDensity.perKloc))].sort(
    (a, b) => a - b,
  );
  console.log(
    `  ${"threshold".padStart(10)}${"TP".padStart(5)}${"FP".padStart(5)}${"FN".padStart(5)}${"TN".padStart(5)}${"acc".padStart(7)}`,
  );
  let best = { threshold: 0, accuracy: 0 };
  for (const value of thresholds) {
    const threshold = value + 0.001;
    const fires = (row: Measured): boolean => row.anyDensity.perKloc >= threshold;
    const truePositives = measured.filter(
      (row) => fires(row) && row.repo.category === "ai-generated",
    ).length;
    const falsePositives = measured.filter(
      (row) => fires(row) && row.repo.category === "control",
    ).length;
    const falseNegatives = measured.filter(
      (row) => !fires(row) && row.repo.category === "ai-generated",
    ).length;
    const trueNegatives = measured.filter(
      (row) => !fires(row) && row.repo.category === "control",
    ).length;
    const accuracy = (truePositives + trueNegatives) / measured.length;
    console.log(
      `  ${threshold.toFixed(3).padStart(10)}${String(truePositives).padStart(5)}${String(falsePositives).padStart(5)}${String(falseNegatives).padStart(5)}${String(trueNegatives).padStart(5)}${`${Math.round(100 * accuracy)}%`.padStart(7)}`,
    );
    if (accuracy > best.accuracy) best = { threshold, accuracy };
  }
  console.log(
    `  best accuracy at ANY threshold: ${Math.round(100 * best.accuracy)}% at >= ${best.threshold.toFixed(3)}/kloc`,
  );
}

function main(): void {
  // repos.json and snapshots/ are both committed, self-controlled data —
  // trusted exactly the way run.ts trusts them.
  const repos = JSON.parse(
    readFileSync(join(CORPUS_DIR, "repos.json"), "utf-8"),
  ) as CorpusRepo[];

  const measured: Measured[] = [];
  const missing: string[] = [];

  for (const repo of repos) {
    const root = join(CACHE_DIR, repo.name);
    const snapshotPath = join(SNAPSHOTS_DIR, `${repo.name}.json`);
    if (!existsSync(root) || !existsSync(snapshotPath)) {
      missing.push(repo.name);
      continue;
    }
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8")) as JsonReport;
    measured.push({
      repo,
      composite: snapshot.composite,
      ruleIds: new Set(snapshot.findings.map((finding) => finding.ruleId)),
      strictness: measureStrictness(root),
      typecheck: measureTypecheck(root),
      builder: measureBuilderMetadata(root),
      anyDensity: measureAnyDensity(root),
    });
  }

  if (missing.length > 0) {
    console.log(
      `Skipped (no checkout or no snapshot — run "pnpm corpus" first): ${missing.join(", ")}\n`,
    );
  }
  if (measured.length === 0) {
    console.error('Nothing to measure. Run "pnpm corpus" to populate corpus/.cache/.');
    process.exitCode = 1;
    return;
  }

  const order = CELLS.map((cell) => `${cell.category}/${cell.stack}`);
  measured.sort(
    (a, b) =>
      order.indexOf(cellLabel(a.repo)) - order.indexOf(cellLabel(b.repo)) ||
      a.repo.name.localeCompare(b.repo.name),
  );

  console.log("=== corpus ===");
  console.log(
    `${"repo".padEnd(28)}${"cell".padEnd(20)}${"score".padStart(7)}${"A".padStart(3)}${"A2".padStart(4)}${"B".padStart(3)}${"B2".padStart(4)}${"C".padStart(3)}${"any/kloc".padStart(10)}`,
  );
  for (const row of measured) {
    console.log(
      row.repo.name.padEnd(28) +
        cellLabel(row.repo).padEnd(20) +
        row.composite.toFixed(2).padStart(7) +
        (row.strictness.lax ? "Y" : "n").padStart(3) +
        (row.strictness.laxWide ? "Y" : "n").padStart(4) +
        (row.typecheck.neverRuns ? "Y" : "n").padStart(3) +
        (row.typecheck.neverRunsFrameworkAware ? "Y" : "n").padStart(4) +
        (row.builder.present ? "Y" : "n").padStart(3) +
        row.anyDensity.perKloc.toFixed(2).padStart(10),
    );
  }

  console.log("\n=== candidate separators ===");
  reportDetector(
    "A  tsconfig strictness (soundness flags)",
    measured,
    (r) => r.strictness.lax,
  );
  reportDetector(
    "A2 tsconfig strictness (+ hygiene flags)",
    measured,
    (r) => r.strictness.laxWide,
  );
  reportDetector(
    "B  typecheck-never-runs (as specified)",
    measured,
    (r) => r.typecheck.neverRuns,
  );
  reportDetector(
    "B2 typecheck-never-runs (framework-aware)",
    measured,
    (r) => r.typecheck.neverRunsFrameworkAware,
  );
  reportDetector("C  builder metadata", measured, (r) => r.builder.present);
  reportAnyDensitySweep(measured);

  console.log("\n=== evidence ===");
  for (const row of measured) {
    console.log(`${row.repo.name} (${cellLabel(row.repo)})`);
    console.log(
      `  tsconfig  ${row.strictness.configs.join(", ") || "(none)"} :: ${
        Object.entries(row.strictness.flags)
          .map(([key, value]) => `${key}=${value}`)
          .join(" ") || "(no tracked flags)"
      }`,
    );
    console.log(
      `  typecheck scripts=${JSON.stringify(row.typecheck.scripts)} ci=${JSON.stringify(row.typecheck.ciFiles)} workflows=${row.typecheck.workflowCount} nextConfig=${JSON.stringify(row.typecheck.nextConfigs)} ignoreBuildErrors=${row.typecheck.ignoreBuildErrors}`,
    );
    console.log(`  markers   ${row.builder.markers.join(", ") || "(none)"}`);
    console.log(
      `  any       ${row.anyDensity.count} in ${row.anyDensity.lines} lines across ${row.anyDensity.files} files`,
    );
  }

  reportShippedRules(measured);
}

main();
