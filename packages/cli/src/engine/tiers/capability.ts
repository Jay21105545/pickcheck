import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { CapabilityRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import type { TierContext, TierResult } from "./types.js";

/**
 * Asks one question about the repo as a whole: does anything, anywhere,
 * establish a named guarantee? Evidence is OR'd across the rule's
 * `providedBy` list — a package.json script, a CI job, a framework config
 * that supplies the guarantee implicitly — and a single finding is
 * produced only when every provider comes up empty.
 *
 * The files it reads are evidence, never the defect, so the finding is
 * reported against `pattern.reportAt`: the file the user would edit to
 * establish the capability, whether or not it exists today.
 *
 * A provider can also be *revoked*. `next build` type-checks by default,
 * so a `next.config.mjs` is a provider — until it carries
 * `typescript: { ignoreBuildErrors: true }`, which switches that off while
 * leaving every surface signal of a type-checked project in place. Reading
 * the provider without reading its off-switch is how a rule ends up
 * confidently wrong about the repos that most need it (DECISIONS/0030).
 */
export async function runCapabilityTier(
  rule: CapabilityRule,
  ctx: TierContext,
): Promise<TierResult> {
  // Same applicability contract every content tier uses: a rule whose
  // `files` glob matched nothing is not a rule this repo failed, it is a
  // rule this repo was never subject to.
  if (micromatch(ctx.scannedFiles, rule.files, { dot: true }).length === 0) {
    return { findings: [], warnings: [] };
  }

  const warnings: string[] = [];
  const missing: string[] = [];

  for (const provider of rule.pattern.providedBy) {
    const satisfied =
      provider.source === "package-scripts"
        ? await hasMatchingScript(provider, ctx, rule.id, warnings)
        : await hasMatchingFile(provider, ctx, rule.id, warnings);
    if (satisfied) {
      return { findings: [], warnings };
    }
    missing.push(provider.label);
  }

  return {
    findings: [
      {
        ruleId: rule.id,
        file: rule.pattern.reportAt,
        severity: rule.severity,
        message: rule.message,
        fixPrompt: buildFixPrompt(
          rule,
          rule.pattern.reportAt,
          undefined,
          `looked for and did not find: ${missing.join("; ")}`,
        ),
      },
    ],
    warnings,
  };
}

type Provider = CapabilityRule["pattern"]["providedBy"][number];

/**
 * Whether any scanned `package.json` declares a script whose *name* or
 * *command* matches. Both halves matter: `"typecheck": "tsc --noEmit"` is
 * found by either, but `buildship-ai/rowy` type-checks only as a step
 * inside `"build": "tsc && vite build"`, where the name says nothing.
 *
 * Scoped to the `scripts` object rather than run over the raw file, so a
 * devDependency that happens to contain the pattern can't vouch for a
 * capability nothing actually runs.
 */
async function hasMatchingScript(
  provider: Provider,
  ctx: TierContext,
  ruleId: string,
  warnings: string[],
): Promise<boolean> {
  if (provider.regex === undefined) {
    return false;
  }
  const regex = new RegExp(provider.regex, provider.flags);
  const manifests = ctx.scannedFiles.filter(
    (file) => basename(file) === "package.json",
  );

  for (const manifest of manifests) {
    const raw = await tryRead(join(ctx.cwd, manifest), ruleId, warnings);
    if (raw === undefined) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // An unparsable manifest is not evidence either way; the repo has
      // bigger problems than this rule, and inventing a verdict from a
      // broken file is worse than staying silent about it.
      continue;
    }
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (typeof scripts !== "object" || scripts === null) {
      continue;
    }
    for (const [name, command] of Object.entries(scripts)) {
      if (regex.test(name) || regex.test(String(command))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether any file matching the provider's globs establishes it. With no
 * `regex`, the file existing is enough — that is how "this project builds
 * with Next.js, which type-checks" is stated. With `revokedBy`, content
 * matching that pattern disqualifies the file even when it would otherwise
 * establish the capability.
 */
async function hasMatchingFile(
  provider: Provider,
  ctx: TierContext,
  ruleId: string,
  warnings: string[],
): Promise<boolean> {
  if (provider.files === undefined) {
    warnings.push(
      `${ruleId}: provider "${provider.label}" has source: files but no files globs`,
    );
    return false;
  }
  const matches = micromatch(ctx.scannedFiles, provider.files, { dot: true });
  const regex =
    provider.regex === undefined
      ? undefined
      : new RegExp(provider.regex, provider.flags);
  const revokedBy =
    provider.revokedBy === undefined
      ? undefined
      : new RegExp(provider.revokedBy, provider.revokedByFlags);

  for (const file of matches) {
    if (regex === undefined && revokedBy === undefined) {
      return true;
    }
    const content = await tryRead(join(ctx.cwd, file), ruleId, warnings);
    if (content === undefined) {
      continue;
    }
    if (revokedBy?.test(content)) {
      continue;
    }
    if (regex === undefined || regex.test(content)) {
      return true;
    }
  }
  return false;
}

async function tryRead(
  path: string,
  ruleId: string,
  warnings: string[],
): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch (error) {
    warnings.push(
      `${ruleId}: could not read ${path} (${error instanceof Error ? error.message : String(error)})`,
    );
    return undefined;
  }
}
