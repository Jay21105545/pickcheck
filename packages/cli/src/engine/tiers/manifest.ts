import { readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { dirname as posixDirname } from "node:path/posix";
import type { ManifestRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

const BUILTIN_MODULES = new Set(builtinModules);

/**
 * Dispatches on `pattern.mode` (DECISIONS/0018) — one tier, two checks that
 * both need the identical ancestor-union dependency resolution below, just
 * applied to a different question: "is this specifier declared" vs. "is
 * ANY of these known packages declared at all."
 */
export async function runManifestTier(
  rule: ManifestRule,
  ctx: TierContext,
): Promise<TierResult> {
  switch (rule.pattern.mode) {
    case "hallucinated-import":
      return runHallucinatedImportCheck(rule, ctx);
    case "requires-dependency":
      return runRequiresDependencyCheck(rule, ctx);
  }
}

/**
 * Cross-references import/require specifiers (extracted by `pattern.regex`,
 * same as the regex tier) against every ancestor manifest's declared
 * dependency names, unioned from the importing file's directory upwards —
 * the same "walk every ancestor node_modules" resolution Node's own
 * module system uses, not a single fixed manifest at the scanned root. In
 * a pnpm/npm/yarn workspace (like pickcheck's own repo — `packages/cli`,
 * `packages/rules`, …) each package's own dependencies live in *its own*
 * package.json, and its tooling config commonly relies on a devDependency
 * declared at the *workspace root* instead (e.g.
 * `packages/cli/tsup.config.ts` importing `tsup`, a root devDependency);
 * reading only one fixed manifest — root-only, or nearest-only — floods
 * false positives on real dependencies declared at the other level. See
 * DECISIONS/0007. The walk continues a bounded distance *above* the
 * scanned root as well, so that same tooling config resolves when the
 * audit is run from inside `packages/cli` rather than the repo root — see
 * `collectAboveScanRoot()` and DECISIONS/0026.
 *
 * The extraction pattern is rule data; only the manifest
 * lookup and the specifier-shape rules below (built-ins, relative paths,
 * subpaths, scoped packages, URL/scheme imports, and baseUrl-resolved
 * local modules — DECISIONS/0015) are generic engine capability.
 */
async function runHallucinatedImportCheck(
  rule: ManifestRule,
  ctx: TierContext,
): Promise<TierResult> {
  if (rule.pattern.mode !== "hallucinated-import") {
    return { findings: [], warnings: [] };
  }
  const pattern = rule.pattern;
  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  const regex = new RegExp(
    pattern.regex,
    pattern.flags?.includes("g") ? pattern.flags : `${pattern.flags ?? ""}g`,
  );
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const manifestCache = createManifestCache();
  const baseDirCache = new Map<string, string>();

  for (const file of matches) {
    const fileDir = posixDirname(file);
    const declared = await declaredDependenciesForFile(
      ctx.cwd,
      fileDir,
      rule,
      manifestCache,
    );
    if (declared.size === 0) {
      // No manifest anywhere the walk reaches declared anything for this
      // file at all — nothing to cross-reference it against, so it's
      // silently out of scope rather than a warning per file.
      continue;
    }

    let content: string;
    try {
      content = await readFile(join(ctx.cwd, file), "utf-8");
    } catch (error) {
      warnings.push(
        `${rule.id}: could not read ${file} (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }

    const baseDir = await resolveBaseDir(ctx.cwd, fileDir, baseDirCache);
    const lines = stripComments(content).split("\n");
    for (const [index, line] of lines.entries()) {
      regex.lastIndex = 0;
      for (const match of line.matchAll(regex)) {
        const specifier = match[1];
        if (specifier === undefined) {
          continue;
        }
        if (!(await isHallucinated(specifier, declared, baseDir))) {
          continue;
        }
        const lineNumber = index + 1;
        findings.push({
          ruleId: rule.id,
          file,
          line: lineNumber,
          severity: rule.severity,
          message: rule.message,
          fixPrompt: buildFixPrompt(rule, file, lineNumber),
        });
      }
    }
  }

  return { findings, warnings };
}

/**
 * Flags a content pattern (e.g. a raw card-number input field) that only
 * matters in the *absence* of a known dependency (e.g. a payment SDK) —
 * DECISIONS/0018. Unlike hallucinated-import, this doesn't extract or
 * validate a specifier per line; a match anywhere in the file is the
 * candidate, and the ancestor-union'd declared dependencies (same
 * resolution as hallucinated-import, just checked for presence of any of
 * `requiresAnyOf` rather than absence of one extracted name) decide
 * whether it's a finding. Deliberately does *not* skip files with zero
 * declared dependencies anywhere up the chain — for this check, "no
 * manifest found at all" is itself evidence the required dependency is
 * absent, not a reason to stay silent. It inherits the above-scanned-root
 * half of that walk too (DECISIONS/0026): a payment SDK declared at a
 * workspace root is just as installed as one declared next door, so
 * auditing a single package must not resurrect the finding.
 */
async function runRequiresDependencyCheck(
  rule: ManifestRule,
  ctx: TierContext,
): Promise<TierResult> {
  if (rule.pattern.mode !== "requires-dependency") {
    return { findings: [], warnings: [] };
  }
  const pattern = rule.pattern;
  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  const regex = new RegExp(
    pattern.regex,
    pattern.flags?.includes("g") ? pattern.flags : `${pattern.flags ?? ""}g`,
  );
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const manifestCache = createManifestCache();

  for (const file of matches) {
    const declared = await declaredDependenciesForFile(
      ctx.cwd,
      posixDirname(file),
      rule,
      manifestCache,
    );
    if (matchesAnyRequiredDependency(declared, pattern.requiresAnyOf)) {
      continue;
    }

    let content: string;
    try {
      content = await readFile(join(ctx.cwd, file), "utf-8");
    } catch (error) {
      warnings.push(
        `${rule.id}: could not read ${file} (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }

    const lines = content.split("\n");
    for (const [index, line] of lines.entries()) {
      regex.lastIndex = 0;
      for (const _match of line.matchAll(regex)) {
        const lineNumber = index + 1;
        findings.push({
          ruleId: rule.id,
          file,
          line: lineNumber,
          severity: rule.severity,
          message: rule.message,
          fixPrompt: buildFixPrompt(rule, file, lineNumber),
        });
      }
    }
  }

  return { findings, warnings };
}

/** Whether `declared` contains any of `requiresAnyOf` — an entry ending in "/*" matches any package under that npm scope. */
function matchesAnyRequiredDependency(
  declared: Set<string>,
  requiresAnyOf: string[],
): boolean {
  return requiresAnyOf.some((entry) => {
    if (entry.endsWith("/*")) {
      const scope = `${entry.slice(0, -1)}`; // "@stripe/*" -> "@stripe/"
      return [...declared].some((name) => name.startsWith(scope));
    }
    return declared.has(entry);
  });
}

/**
 * Per-run memoisation for the ancestor walk. Two caches, because the walk
 * has two halves with different keys: `perDir` is keyed by a
 * scanned-root-relative directory, while everything above the scanned
 * root is one absolute-path walk whose result is identical for every file
 * in the run.
 */
interface ManifestCache {
  /** Cumulative declared dependencies per scanned-root-relative directory. */
  perDir: Map<string, Set<string>>;
  /** Memoised `dependenciesAboveScanRoot()`; `undefined` until first computed. */
  aboveScanRoot: Set<string> | undefined;
}

function createManifestCache(): ManifestCache {
  return { perDir: new Map(), aboveScanRoot: undefined };
}

/**
 * Unions the declared-dependency sets of every manifest found from `dir`
 * up to (and including) the scanned root, then — via
 * `dependenciesAboveScanRoot()` — of the bounded run of manifests above
 * it. Not just the nearest one: this mirrors Node's own bare-specifier
 * resolution, which walks every ancestor `node_modules` up to the
 * filesystem root, not only the closest. A package's tooling config (e.g.
 * `tsup.config.ts`) commonly imports a devDependency declared at the
 * *workspace root* rather than repeated in every package, and that's a
 * real, resolvable import, not a hallucinated one.
 *
 * An empty result means either no manifest existed anywhere in the chain,
 * or every manifest that did exist declared nothing — the two aren't
 * distinguished, and the caller treats both the same way (nothing to
 * check this file's imports against, so it's silently skipped rather than
 * flagging every bare specifier). Each directory's cumulative result is
 * cached, so a package with hundreds of files only ever reads and parses
 * each ancestor manifest once.
 */
async function declaredDependenciesForFile(
  cwd: string,
  dir: string,
  rule: ManifestRule,
  cache: ManifestCache,
): Promise<Set<string>> {
  const cached = cache.perDir.get(dir);
  if (cached !== undefined) {
    return cached;
  }

  const own =
    (await tryReadManifest(
      join(cwd, dir, rule.pattern.manifestFile),
      rule.pattern.dependencyFields,
    )) ?? new Set<string>();

  const result =
    dir === "."
      ? union(own, await dependenciesAboveScanRoot(cwd, rule, cache))
      : union(
          own,
          await declaredDependenciesForFile(cwd, posixDirname(dir), rule, cache),
        );

  cache.perDir.set(dir, result);
  return result;
}

/** Memoised `collectAboveScanRoot()` — one walk per run, not one per file. */
async function dependenciesAboveScanRoot(
  cwd: string,
  rule: ManifestRule,
  cache: ManifestCache,
): Promise<Set<string>> {
  if (cache.aboveScanRoot === undefined) {
    cache.aboveScanRoot = await collectAboveScanRoot(cwd, rule);
  }
  return cache.aboveScanRoot;
}

/**
 * The declared dependencies of the manifests *above* the scanned root —
 * the fix for `cd packages/cli && pickcheck audit` flagging
 * `tsup.config.ts`'s `import { defineConfig } from "tsup"`, where `tsup`
 * is a devDependency of the monorepo ROOT and the walk above used to
 * bottom out at the scanned root and give up (DECISIONS/0026).
 *
 * Bounded at both ends, because a walk that leaves the audited tree has
 * to be able to say where it stops:
 *
 * - **It doesn't start** if the scanned root is itself a project root.
 *   Auditing a whole repo already sees every manifest that governs it;
 *   climbing further would read whatever unrelated directories happen to
 *   sit above the checkout (`~/package.json`, `/srv/package.json`) and
 *   let them silently vouch for imports.
 * - **It stops, inclusively, at the first project root above.** That
 *   root's manifest is exactly the workspace-root package.json this
 *   exists to find, so it's read before stopping.
 * - **It contributes nothing if no project root is found.** Reaching the
 *   filesystem root without one means the scanned directory isn't
 *   enclosed by any project we can identify, so there is no principled
 *   boundary — and an unbounded union of every ancestor manifest would
 *   turn "declared somewhere on this machine" into "not hallucinated".
 *   Discarding what was collected is the conservative read: at worst the
 *   tier behaves exactly as it did before this walk existed.
 *
 * Only manifests are ever read up here. No file above the scanned root is
 * scanned, and no finding can be reported against one.
 */
async function collectAboveScanRoot(
  cwd: string,
  rule: ManifestRule,
): Promise<Set<string>> {
  if (await isProjectRoot(cwd)) {
    return new Set<string>();
  }

  const collected = new Set<string>();
  let dir = dirname(cwd);
  let previous = cwd;
  // `dirname()` is a fixed point at the filesystem root ("/" on POSIX,
  // `C:\` on Windows), which is what ends the walk when no project root
  // is ever found.
  while (dir !== previous) {
    const own = await tryReadManifest(
      join(dir, rule.pattern.manifestFile),
      rule.pattern.dependencyFields,
    );
    if (own !== undefined) {
      for (const name of own) {
        collected.add(name);
      }
    }
    if (await isProjectRoot(dir)) {
      return collected;
    }
    previous = dir;
    dir = dirname(dir);
  }

  return new Set<string>();
}

/**
 * Whether `dir` is the root of a project or workspace — the boundary
 * `collectAboveScanRoot()` refuses to cross. Three markers, covering the
 * ways the ecosystem actually declares one:
 *
 * - `.git` — a repository root. Matched as a path, not a directory:
 *   worktrees and submodules make it a *file* containing a gitdir
 *   pointer.
 * - `pnpm-workspace.yaml` — pnpm's workspace declaration, which lives
 *   nowhere but a workspace root.
 * - `package.json` with a `workspaces` field — npm's and yarn's
 *   equivalent (an array, or an object with a `packages` key).
 */
async function isProjectRoot(dir: string): Promise<boolean> {
  if (await pathExists(join(dir, ".git"))) {
    return true;
  }
  if (await pathExists(join(dir, "pnpm-workspace.yaml"))) {
    return true;
  }
  return declaresWorkspaces(join(dir, "package.json"));
}

/** Whether the manifest at `path` has a `workspaces` field — missing, unreadable and unparsable manifests all read as "no", same silent-skip philosophy as `tryReadManifest`. */
async function declaresWorkspaces(path: string): Promise<boolean> {
  const raw = await tryReadFile(path);
  if (raw === undefined) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return false;
    }
    const workspaces = (parsed as Record<string, unknown>).workspaces;
    return workspaces !== undefined && workspaces !== null;
  } catch {
    return false;
  }
}

function union(a: Set<string>, b: Set<string>): Set<string> {
  if (a.size === 0) return b;
  if (b.size === 0) return a;
  return new Set([...a, ...b]);
}

/** Reads and unions one manifest's dependency fields into a package-name set, or `undefined` if it's missing/unparsable. */
async function tryReadManifest(
  manifestPath: string,
  dependencyFields: string[],
): Promise<Set<string> | undefined> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }

  const declared = new Set<string>();
  const manifest = parsed as Record<string, unknown>;
  for (const field of dependencyFields) {
    const value = manifest[field];
    if (typeof value === "object" && value !== null) {
      for (const name of Object.keys(value)) {
        declared.add(name);
      }
    }
  }
  return declared;
}

/**
 * A bare specifier absent from `declared`, that isn't a Node builtin, a
 * relative import, a URL/scheme import, a local path alias, or a bare
 * specifier that resolves to a real file/directory relative to `baseDir`
 * (DECISIONS/0015) — the same "isn't actually a package" question,
 * answered a fourth way.
 */
async function isHallucinated(
  specifier: string,
  declared: Set<string>,
  baseDir: string,
): Promise<boolean> {
  const packageName = derivePackageName(specifier);
  if (packageName === undefined) {
    return false;
  }
  if (BUILTIN_MODULES.has(packageName)) {
    return false;
  }
  if (declared.has(packageName)) {
    return false;
  }
  return !(await resolvesLocally(baseDir, specifier));
}

/** A scheme prefix (`https:`, `http:`, `npm:`, `jsr:`, `node:`, …) — never a bare npm specifier. */
const SCHEME_SPECIFIER = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Extracts the installable package name from an import specifier, or
 * `undefined` if the specifier isn't a package import at all: a relative
 * path, an absolute path, a scheme-prefixed specifier (`https://…`/
 * `http://…` — Deno/edge-function URL imports, resolved by the Deno
 * runtime, never package.json; `npm:`/`jsr:` — Deno's own package-registry
 * schemes; `node:` — already exempted as a builtin below, but harmless to
 * short-circuit here too), or a `@/`-style local alias, as used by
 * Next.js/tsconfig `paths` — that's a single-segment "scope" with nothing
 * after it, never a real npm scope.
 */
function derivePackageName(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return undefined;
  }
  if (SCHEME_SPECIFIER.test(specifier)) {
    return undefined;
  }
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    const [scope, name] = segments;
    if (scope === undefined || scope === "@" || name === undefined || name === "") {
      return undefined;
    }
    return `${scope}/${name}`;
  }
  return segments[0];
}

/** File extensions tried, in order, when resolving a bare specifier to an on-disk local module. */
const RESOLVABLE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".d.ts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

/**
 * Whether `specifier` resolves to a real file or directory under `baseDir`
 * — the same resolution a bundler performs for a bare specifier once a
 * `baseUrl` (or an equivalent root-relative convention) is in play, e.g.
 * `"components/carousel"` under `baseDir = <repo root>` resolving to
 * `components/carousel.tsx`, or `"types"` resolving to `types/index.d.ts`.
 * Deliberately permissive about *how* it resolves (exact file, `/index`,
 * or a bare directory) — this tier isn't a real module resolver, just
 * asking "does something at this path plausibly exist," the same
 * plausibility bar the manifest cross-reference itself uses.
 */
async function resolvesLocally(baseDir: string, specifier: string): Promise<boolean> {
  const target = join(baseDir, specifier);
  for (const ext of RESOLVABLE_EXTENSIONS) {
    if (await isFile(`${target}${ext}`)) {
      return true;
    }
  }
  for (const ext of RESOLVABLE_EXTENSIONS) {
    if (await isFile(join(target, `index${ext}`))) {
      return true;
    }
  }
  return isDirectory(target);
}

/**
 * The directory bare specifiers resolve against for a given file's
 * directory: the `baseUrl` of the nearest ancestor `tsconfig.json`/
 * `jsconfig.json` (up to the scanned root), or the scanned root itself if
 * none declares one — DECISIONS/0015. This intentionally does *not* union
 * across ancestors the way manifest dependency lookup does: `baseUrl` is a
 * single resolved value from whichever config actually applies, not a
 * cumulative set. Falling back to the scanned root (rather than "no
 * baseUrl, so nothing resolves locally") also covers bundler setups
 * (Vite's default root resolution, `webpack`'s `resolve.modules`) that
 * allow root-relative bare imports with no `tsconfig.json` in the picture
 * at all.
 */
async function resolveBaseDir(
  cwd: string,
  dir: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(dir);
  if (cached !== undefined) {
    return cached;
  }

  const ownBaseUrl = await tryReadTsconfigBaseUrl(join(cwd, dir));
  let result: string;
  if (ownBaseUrl !== undefined) {
    result = join(cwd, dir, ownBaseUrl);
  } else if (dir === ".") {
    result = cwd;
  } else {
    result = await resolveBaseDir(cwd, posixDirname(dir), cache);
  }

  cache.set(dir, result);
  return result;
}

/** Reads `compilerOptions.baseUrl` out of a `tsconfig.json`/`jsconfig.json` in `absDir`, tolerating JSONC comments. */
async function tryReadTsconfigBaseUrl(absDir: string): Promise<string | undefined> {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const baseUrl = await tryParseBaseUrl(join(absDir, name));
    if (baseUrl !== undefined) {
      return baseUrl;
    }
  }
  return undefined;
}

/** Reads and parses a single tsconfig/jsconfig candidate, or `undefined` if it's missing, unparsable, or declares no `baseUrl` — same silent-skip philosophy as `tryReadManifest` for an unparsable package.json. */
async function tryParseBaseUrl(path: string): Promise<string | undefined> {
  const raw = await tryReadFile(path);
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(stripComments(raw)) as {
      compilerOptions?: { baseUrl?: unknown };
    };
    const baseUrl = parsed.compilerOptions?.baseUrl;
    return typeof baseUrl === "string" ? baseUrl : undefined;
  } catch {
    return undefined;
  }
}

async function tryReadFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
}

/** Whether anything exists at `path` — file or directory alike. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Neutralizes `//` line comments and `/* … *\/` block comments — including
 * JSDoc type annotations like `/** @type {import('pkg')} *\/` — by
 * replacing their content (never their newlines) with spaces, so the
 * per-line specifier-extraction regex can no longer read commented-out
 * code or plain English prose as a live import (DECISIONS/0015). A quote
 * character only opens a string when it isn't already inside a comment,
 * and `//`/`/*` only open a comment when they aren't already inside a
 * string — this is a character-scan, not a real lexer, so it doesn't
 * handle every edge case (nested template-literal expressions, regex
 * literals containing `//`), but it correctly leaves a URL like
 * `"https://deno.land/…"` alone (the `//` is inside an open string) while
 * still stripping a genuine line comment or JSDoc block.
 */
export function stripComments(content: string): string {
  let result = "";
  let quote: "'" | '"' | "`" | undefined;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        result += ch;
      } else {
        result += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        result += "  ";
        i++;
      } else if (ch === "\n") {
        result += "\n";
      } else {
        result += " ";
      }
      continue;
    }

    if (quote !== undefined) {
      result += ch;
      if (ch === "\\" && next !== undefined) {
        result += next;
        i++;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      result += "  ";
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      result += "  ";
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      result += ch;
      continue;
    }
    result += ch;
  }

  return result;
}
