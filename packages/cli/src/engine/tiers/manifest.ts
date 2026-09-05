import { readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { dirname as posixDirname } from "node:path/posix";
import type { ManifestRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import { stripComments } from "../strip-comments.js";
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
  const tsconfigCache = new Map<string, TsconfigResolution>();

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

    const tsconfig = await resolveTsconfig(ctx.cwd, fileDir, tsconfigCache);
    const lines = stripComments(content).split("\n");
    for (const [index, line] of lines.entries()) {
      regex.lastIndex = 0;
      for (const match of line.matchAll(regex)) {
        const specifier = match[1];
        if (specifier === undefined) {
          continue;
        }
        if (!(await isHallucinated(specifier, declared, tsconfig))) {
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
 * specifier that resolves to a real file/directory relative to the
 * resolved `baseDir` (DECISIONS/0015) — the same "isn't actually a
 * package" question, answered five ways.
 *
 * A specifier claimed by a `compilerOptions.paths` pattern is exempt
 * *without* checking that the target file exists, deliberately. This rule
 * is about supply chain: an undeclared specifier is a finding because a
 * build resolves it against the npm registry, where an attacker can
 * publish the name (slopsquatting). A path alias never reaches the
 * registry — the bundler rewrites it to a local file first — so it is out
 * of scope whether or not the file behind it is there. A broken alias is
 * a build error for `tsc` to report, not a security finding. This is the
 * same standard `derivePackageName` already applies to `@/`-style
 * aliases, which it exempts on shape alone. See DECISIONS/0030.
 */
async function isHallucinated(
  specifier: string,
  declared: Set<string>,
  tsconfig: TsconfigResolution,
): Promise<boolean> {
  if (matchesPathAlias(specifier, tsconfig.pathPatterns)) {
    return false;
  }
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
  return !(await resolvesLocally(tsconfig.baseDir, specifier));
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
 * The tsconfig facts a bare specifier is checked against, resolved for one
 * directory: where root-relative imports resolve from, and which
 * specifiers are local path aliases rather than package names.
 */
interface TsconfigResolution {
  /** Absolute directory bare specifiers resolve against. */
  baseDir: string;
  /** `compilerOptions.paths` keys, e.g. `["@src/*", "@root/*"]`. */
  pathPatterns: string[];
}

/**
 * The tsconfig resolution for a given file's directory: from the nearest
 * ancestor `tsconfig.json`/`jsconfig.json` (up to the scanned root),
 * falling back to the scanned root with no aliases if none applies.
 *
 * `baseUrl` gives the directory bare specifiers resolve against
 * (DECISIONS/0015) — the scanned-root fallback also covers bundler setups
 * (Vite's default root resolution, webpack's `resolve.modules`) that allow
 * root-relative bare imports with no `tsconfig.json` in the picture at all.
 * `paths` gives the local alias patterns (DECISIONS/0030).
 *
 * Both are single resolved values from whichever config actually applies,
 * not the cumulative union manifest dependency lookup builds: a nearer
 * config's `baseUrl` replaces an ancestor's rather than adding to it, and
 * TypeScript treats `paths` the same way. Each is inherited from the
 * parent directory *independently*, though — a config that sets only
 * `paths` leaves an ancestor's `baseUrl` in force, which is exactly what
 * `compilerOptions` merging does.
 */
async function resolveTsconfig(
  cwd: string,
  dir: string,
  cache: Map<string, TsconfigResolution>,
): Promise<TsconfigResolution> {
  const cached = cache.get(dir);
  if (cached !== undefined) {
    return cached;
  }

  const own = await readTsconfigChain(join(cwd, dir));
  const inherited: TsconfigResolution =
    dir === "."
      ? { baseDir: cwd, pathPatterns: [] }
      : await resolveTsconfig(cwd, posixDirname(dir), cache);

  const result: TsconfigResolution = {
    baseDir:
      own?.baseUrl === undefined
        ? inherited.baseDir
        : join(own.baseUrl.declaredIn, own.baseUrl.value),
    pathPatterns: own?.pathPatterns ?? inherited.pathPatterns,
  };

  cache.set(dir, result);
  return result;
}

/**
 * A `compilerOptions` value together with the directory of the config file
 * that declared it. TypeScript resolves a relative `baseUrl` against the
 * file it was *written in*, not against the file that inherited it, so an
 * `extends` chain has to carry the origin along with the value.
 */
interface DeclaredValue {
  value: string;
  declaredIn: string;
}

interface TsconfigChain {
  baseUrl?: DeclaredValue;
  pathPatterns?: string[];
}

/** Resolves `tsconfig.json`, else `jsconfig.json`, in `absDir` — each through its full `extends` chain. */
async function readTsconfigChain(absDir: string): Promise<TsconfigChain | undefined> {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const chain = await readConfigChain(join(absDir, name), new Set(), 0);
    if (chain !== undefined) {
      return chain;
    }
  }
  return undefined;
}

/**
 * How many `extends` hops to follow before giving up. Real chains are two
 * or three long (`@tsconfig/*` bases, a shared monorepo config); this only
 * has to be larger than anything sane, since a cycle is already caught by
 * `visited`.
 */
const MAX_EXTENDS_DEPTH = 16;

/**
 * Reads one tsconfig and everything it `extends`, merging base-first so a
 * nearer config's value wins — the same precedence `tsc` applies.
 *
 * Following `extends` is what tells a local path alias apart from an npm
 * package name. `buildship-ai/rowy` declares `"@src/*"` and `"@root/*"` in
 * a `tsconfig.extend.json` that its `tsconfig.json` inherits; read one
 * file deep, the `paths` are invisible and `@src/components` reads as an
 * undeclared scoped package. That was 1,655 false positives on one control
 * repo — see DECISIONS/0030.
 *
 * `undefined` means no config file at this path. A config that exists but
 * declares neither option returns an empty chain, which is *not* the same
 * thing: it stops the caller inheriting nothing, while still letting each
 * option fall through to the parent directory independently.
 */
async function readConfigChain(
  path: string,
  visited: Set<string>,
  depth: number,
): Promise<TsconfigChain | undefined> {
  if (depth > MAX_EXTENDS_DEPTH || visited.has(path)) {
    return undefined;
  }
  visited.add(path);

  const raw = await tryReadFile(path);
  if (raw === undefined) {
    return undefined;
  }

  let parsed: {
    extends?: unknown;
    compilerOptions?: { baseUrl?: unknown; paths?: unknown };
  };
  try {
    parsed = JSON.parse(stripComments(raw));
  } catch {
    // Same silent-skip philosophy as `tryReadManifest` for an unparsable
    // package.json: an unreadable config means "nothing learned here",
    // never a finding of its own.
    return undefined;
  }

  const dir = dirname(path);
  const merged: TsconfigChain = {};

  // Bases first, in declaration order — TS 5.0's array form resolves left
  // to right with later entries winning, and the extending file wins over
  // all of them.
  for (const spec of extendsSpecifiers(parsed.extends)) {
    const target = await resolveExtendsTarget(dir, spec);
    if (target === undefined) {
      continue;
    }
    const base = await readConfigChain(target, visited, depth + 1);
    if (base?.baseUrl !== undefined) {
      merged.baseUrl = base.baseUrl;
    }
    if (base?.pathPatterns !== undefined) {
      merged.pathPatterns = base.pathPatterns;
    }
  }

  const options = parsed.compilerOptions;
  if (typeof options?.baseUrl === "string") {
    merged.baseUrl = { value: options.baseUrl, declaredIn: dir };
  }
  if (typeof options?.paths === "object" && options.paths !== null) {
    // `paths` is one compiler option, so a nearer config's mapping
    // replaces an inherited one wholesale rather than merging key by key.
    merged.pathPatterns = Object.keys(options.paths);
  }

  return merged;
}

/** Normalizes `extends` to a list — a string, TS 5.0's array of strings, or nothing at all. */
function extendsSpecifiers(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

/**
 * Resolves one `extends` specifier to a config file on disk, or
 * `undefined` if nothing is there. Two forms, matching `tsc`:
 *
 * - **Relative or absolute** (`./tsconfig.extend.json`, `../base`) —
 *   against the extending file's own directory, with `.json` appended and
 *   a directory's `tsconfig.json` tried in turn, since both are written
 *   without the full path in practice.
 * - **Bare** (`@tsconfig/node20/tsconfig.json`, `@repo/tsconfig/base`) —
 *   looked up in each ancestor `node_modules`, the way Node resolves any
 *   other package.
 */
async function resolveExtendsTarget(
  fromDir: string,
  spec: string,
): Promise<string | undefined> {
  if (spec.startsWith(".") || isAbsolute(spec)) {
    return firstExistingConfig(join(fromDir, spec));
  }

  let dir = fromDir;
  let previous = "";
  while (dir !== previous) {
    const found = await firstExistingConfig(join(dir, "node_modules", spec));
    if (found !== undefined) {
      return found;
    }
    previous = dir;
    dir = dirname(dir);
  }
  return undefined;
}

/** The first of `<target>`, `<target>.json`, `<target>/tsconfig.json` that is a real file. */
async function firstExistingConfig(target: string): Promise<string | undefined> {
  for (const candidate of [target, `${target}.json`, join(target, "tsconfig.json")]) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Whether `specifier` is matched by a `compilerOptions.paths` pattern —
 * i.e. the bundler rewrites it to a local file and it never reaches a
 * package registry.
 *
 * A TypeScript path pattern holds at most one `*`, which matches any run
 * of characters (including none), so matching is a prefix/suffix test
 * rather than a glob. Which mapping *wins* is `tsc`'s business; this tier
 * only asks whether any claims the specifier.
 */
function matchesPathAlias(specifier: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const star = pattern.indexOf("*");
    if (star === -1) {
      return specifier === pattern;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    return (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
    );
  });
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
