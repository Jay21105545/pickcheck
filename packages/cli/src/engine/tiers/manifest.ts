import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { dirname as posixDirname } from "node:path/posix";
import type { ManifestRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

const BUILTIN_MODULES = new Set(builtinModules);

/**
 * Cross-references import/require specifiers (extracted by `pattern.regex`,
 * same as the regex tier) against every ancestor manifest's declared
 * dependency names, unioned from the importing file's directory up to the
 * scanned root — the same "walk every ancestor node_modules" resolution
 * Node's own module system uses, not a single fixed manifest at the
 * scanned root. In a pnpm/npm/yarn workspace (like pickcheck's own repo —
 * `packages/cli`, `packages/rules`, …) each package's own dependencies
 * live in *its own* package.json, and its tooling config commonly relies
 * on a devDependency declared at the *workspace root* instead (e.g.
 * `packages/cli/tsup.config.ts` importing `tsup`, a root devDependency);
 * reading only one fixed manifest — root-only, or nearest-only — floods
 * false positives on real dependencies declared at the other level. See
 * DECISIONS/0007. The extraction pattern is rule data; only the manifest
 * lookup and the specifier-shape rules below (built-ins, relative paths,
 * subpaths, scoped packages) are generic engine capability.
 */
export async function runManifestTier(
  rule: ManifestRule,
  ctx: TierContext,
): Promise<TierResult> {
  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  const regex = new RegExp(
    rule.pattern.regex,
    rule.pattern.flags?.includes("g")
      ? rule.pattern.flags
      : `${rule.pattern.flags ?? ""}g`,
  );
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const manifestCache = new Map<string, Set<string>>();

  for (const file of matches) {
    const declared = await declaredDependenciesForFile(
      ctx.cwd,
      posixDirname(file),
      rule,
      manifestCache,
    );
    if (declared.size === 0) {
      // No ancestor manifest (up to the scanned root) declared anything
      // for this file at all — nothing to cross-reference it against, so
      // it's silently out of scope rather than a warning per file.
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
      for (const match of line.matchAll(regex)) {
        const specifier = match[1];
        if (specifier === undefined || !isHallucinated(specifier, declared)) {
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
 * Unions the declared-dependency sets of every manifest found from `dir`
 * up to (and including) the scanned root — not just the nearest one.
 * This mirrors Node's own bare-specifier resolution, which walks every
 * ancestor `node_modules` up to the filesystem root, not only the closest
 * one: a package's tooling config (e.g. `tsup.config.ts`) commonly imports
 * a devDependency declared at the *workspace root* rather than repeated
 * in every package, and that's a real, resolvable import, not a
 * hallucinated one. An empty result means either no manifest existed
 * anywhere in the chain, or every manifest that did exist declared
 * nothing — the two aren't distinguished, and the caller treats both the
 * same way (nothing to check this file's imports against, so it's
 * silently skipped rather than flagging every bare specifier). Each
 * directory's cumulative result is cached, so a package with hundreds of
 * files only ever reads and parses each ancestor manifest once.
 */
async function declaredDependenciesForFile(
  cwd: string,
  dir: string,
  rule: ManifestRule,
  cache: Map<string, Set<string>>,
): Promise<Set<string>> {
  const cached = cache.get(dir);
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
      ? own
      : union(
          own,
          await declaredDependenciesForFile(cwd, posixDirname(dir), rule, cache),
        );

  cache.set(dir, result);
  return result;
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

/** A bare specifier absent from `declared`, that isn't a Node builtin, relative import, or local path alias. */
function isHallucinated(specifier: string, declared: Set<string>): boolean {
  const packageName = derivePackageName(specifier);
  if (packageName === undefined) {
    return false;
  }
  if (
    BUILTIN_MODULES.has(packageName) ||
    BUILTIN_MODULES.has(stripNodePrefix(specifier))
  ) {
    return false;
  }
  return !declared.has(packageName);
}

/**
 * Extracts the installable package name from an import specifier, or
 * `undefined` if the specifier isn't a package import at all (a relative
 * path, an absolute path, or a `@/`-style local alias, as used by
 * Next.js/tsconfig `paths` — that's a single-segment "scope" with nothing
 * after it, never a real npm scope).
 */
function derivePackageName(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
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

function stripNodePrefix(specifier: string): string {
  return specifier.startsWith("node:") ? specifier.slice("node:".length) : specifier;
}
