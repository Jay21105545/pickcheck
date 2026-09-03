import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import fg from "fast-glob";

export type Ecosystem = "node" | "python" | "unknown";

export interface DetectedStack {
  ecosystem: Ecosystem;
  projectName: string;
  /** Node only; null for python/unknown. */
  packageManager: "pnpm" | "yarn" | "bun" | "npm" | null;
  framework: string;
  installCmd: string;
  testCmd: string;
  lintCmd: string;
  /** Files that make up the detected API surface, relative to cwd, sorted. */
  apiFiles: string[];
  /** .env-like files found at the repo root, relative to cwd, sorted. */
  envFiles: string[];
}

// Mirrors docs/api-doc-exists's `pattern.when.files` in packages/rules —
// same convention pickcheck's own rules use to decide "this repo has an
// API surface".
const API_GLOB_PATTERNS = [
  "app/api/**/*",
  "pages/api/**/*",
  "routes/**/*",
  "src/routes/**/*",
  "api/**/*",
];

// Fallback for frameworks with no file-based routing convention: a small,
// fixed set of likely entry files, checked for a framework instantiation
// marker. Only consulted when no glob above matched anything.
const MARKER_CANDIDATES = [
  "server.ts",
  "server.js",
  "app.ts",
  "app.js",
  "index.ts",
  "index.js",
  "src/server.ts",
  "src/server.js",
  "src/index.ts",
  "src/index.js",
  "src/app.ts",
  "src/app.js",
  "main.py",
  "app.py",
  "src/main.py",
];

const MARKER_PATTERNS: RegExp[] = [
  /\bexpress\s*\(\s*\)/, // Express
  /\bFastify\s*\(/, // Fastify
  /\bFastAPI\s*\(/, // FastAPI
  /\bFlask\s*\(\s*__name__/, // Flask
];

const ENV_FILE_NAMES = [".env", ".env.local", ".env.production", ".env.development"];

/**
 * Detects the target repo's ecosystem/framework/tooling from package.json
 * or requirements.txt, plus its API surface and .env files — shared by
 * `pickcheck init` (stack-aware docs-kit content) and `pickcheck gen api`
 * (which files to embed).
 */
export async function detectStack(cwd: string): Promise<DetectedStack> {
  const [apiFiles, envFiles] = await Promise.all([
    findApiFiles(cwd),
    findEnvFiles(cwd),
  ]);

  const packageJson = await readJsonIfExists(join(cwd, "package.json"));
  if (packageJson !== null) {
    return detectNode(cwd, packageJson, apiFiles, envFiles);
  }

  const requirements = await readFileIfExists(join(cwd, "requirements.txt"));
  if (requirements !== null) {
    return detectPython(cwd, requirements, apiFiles, envFiles);
  }

  return {
    ecosystem: "unknown",
    projectName: basename(cwd),
    packageManager: null,
    framework: "unknown",
    installCmd: "# no package.json or requirements.txt detected",
    testCmd: "# no test command detected",
    lintCmd: "# no lint command detected",
    apiFiles,
    envFiles,
  };
}

async function detectNode(
  cwd: string,
  packageJson: Record<string, unknown>,
  apiFiles: string[],
  envFiles: string[],
): Promise<DetectedStack> {
  const deps = {
    ...asStringRecord(packageJson.dependencies),
    ...asStringRecord(packageJson.devDependencies),
  };
  const scripts = asStringRecord(packageJson.scripts);
  const packageManager = await detectPackageManager(cwd, packageJson);

  return {
    ecosystem: "node",
    projectName:
      typeof packageJson.name === "string" ? packageJson.name : basename(cwd),
    packageManager,
    framework: detectNodeFramework(deps),
    installCmd: `${packageManager} install`,
    testCmd:
      "test" in scripts
        ? `${packageManager} test`
        : '# no "test" script in package.json',
    lintCmd:
      "lint" in scripts
        ? `${packageManager} run lint`
        : '# no "lint" script in package.json',
    apiFiles,
    envFiles,
  };
}

function detectNodeFramework(deps: Record<string, string>): string {
  if ("next" in deps) return "next";
  if ("@nestjs/core" in deps) return "nest";
  if ("fastify" in deps) return "fastify";
  if ("express" in deps) return "express";
  if ("koa" in deps) return "koa";
  return "generic";
}

async function detectPackageManager(
  cwd: string,
  packageJson: Record<string, unknown>,
): Promise<"pnpm" | "yarn" | "bun" | "npm"> {
  const field = packageJson.packageManager;
  if (typeof field === "string") {
    const name = field.split("@")[0];
    if (name === "pnpm" || name === "yarn" || name === "bun" || name === "npm") {
      return name;
    }
  }

  const lockfiles: Array<["pnpm" | "yarn" | "bun" | "npm", string]> = [
    ["pnpm", "pnpm-lock.yaml"],
    ["yarn", "yarn.lock"],
    ["bun", "bun.lockb"],
    ["npm", "package-lock.json"],
  ];
  for (const [manager, lockfile] of lockfiles) {
    if (await pathExists(join(cwd, lockfile))) {
      return manager;
    }
  }
  return "npm";
}

function detectPython(
  cwd: string,
  requirements: string,
  apiFiles: string[],
  envFiles: string[],
): DetectedStack {
  const lower = requirements.toLowerCase();
  const framework = lower.includes("fastapi")
    ? "fastapi"
    : lower.includes("flask")
      ? "flask"
      : lower.includes("django")
        ? "django"
        : "generic";

  return {
    ecosystem: "python",
    projectName: basename(cwd),
    packageManager: null,
    framework,
    installCmd: "pip install -r requirements.txt",
    testCmd: "pytest",
    lintCmd: "ruff check .",
    apiFiles,
    envFiles,
  };
}

async function findApiFiles(cwd: string): Promise<string[]> {
  const globMatches = await fg(API_GLOB_PATTERNS, {
    cwd,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/fixtures/**", "**/.git/**"],
  });
  if (globMatches.length > 0) {
    return globMatches.sort();
  }

  const markerFiles: string[] = [];
  for (const candidate of MARKER_CANDIDATES) {
    const content = await readFileIfExists(join(cwd, candidate));
    if (content !== null && MARKER_PATTERNS.some((pattern) => pattern.test(content))) {
      markerFiles.push(candidate);
    }
  }
  return markerFiles.sort();
}

async function findEnvFiles(cwd: string): Promise<string[]> {
  const matches = await fg(ENV_FILE_NAMES, { cwd, onlyFiles: true, dot: true });
  return matches.sort();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | null> {
  const raw = await readFileIfExists(path);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }
  return result;
}
