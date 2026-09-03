import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
// Type-only import: erased at build (tsconfig's verbatimModuleSyntax), so
// this costs nothing at runtime and does NOT violate the lazy-load
// constraint below — only a value-level import would pull the native
// binding into the cold-start path.
import type { NapiConfig, SgNode } from "@ast-grep/napi";
import type { AstgrepRule } from "@pickcheck/rules/schema";
import micromatch from "micromatch";
import { buildFixPrompt } from "../findings.js";
import type { Finding } from "../types.js";
import type { TierContext, TierResult } from "./types.js";

/**
 * Maps a file extension to the ast-grep language that can parse it.
 * @ast-grep/napi's JavaScript grammar already handles JSX embedded in
 * .js/.jsx/.mjs/.cjs, so those all share Lang.JavaScript; only .tsx needs
 * the dedicated Tsx grammar. An extension with no entry here (e.g. .py)
 * is simply skipped for this rule — not a crash, just no coverage yet.
 */
const LANG_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".tsx": "Tsx",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
};

/**
 * Structural matching via @ast-grep/napi. Lazy-loaded (dynamic import
 * inside this function, never at module scope) per CLAUDE.md's cold-start
 * constraint — the native binding is only paid for once an astgrep-tier
 * rule is actually dispatched. `rule.pattern` is ast-grep's own YAML rule
 * shape (see ARCHITECTURE.md), passed straight through to `findAll()`
 * unmodified.
 */
export async function runAstgrepTier(
  rule: AstgrepRule,
  ctx: TierContext,
): Promise<TierResult> {
  const matches = micromatch(ctx.scannedFiles, rule.files, { dot: true });
  if (matches.length === 0) {
    return { findings: [], warnings: [] };
  }

  let astgrep: typeof import("@ast-grep/napi");
  try {
    astgrep = await import("@ast-grep/napi");
  } catch (error) {
    return {
      findings: [],
      warnings: [
        `${rule.id}: could not load @ast-grep/napi (${describeError(error)}) — skipped`,
      ],
    };
  }

  // `pattern` is validated only as "some record" by ruleSchema (it's
  // ast-grep's own rule format, not pickcheck's to validate structurally —
  // see schema.ts). This cast hands it to ast-grep as-is; a shape ast-grep
  // itself rejects (bad kind name, unknown field, ...) throws synchronously
  // from findAll() below and is handled like any other malformed pattern.
  const matcher = rule.pattern as unknown as NapiConfig;

  const findings: Finding[] = [];
  const readWarnings = new Set<string>();
  let patternError: string | undefined;

  for (const file of matches) {
    if (patternError !== undefined) {
      break; // same pattern, same config — it'll fail identically on the rest
    }

    const lang = LANG_BY_EXTENSION[extname(file)];
    if (lang === undefined) {
      continue;
    }

    let content: string;
    try {
      content = await readFile(join(ctx.cwd, file), "utf-8");
    } catch (error) {
      readWarnings.add(`${rule.id}: could not read ${file} (${describeError(error)})`);
      continue;
    }

    let matchedNodes: SgNode[];
    try {
      const root = astgrep.parse(lang, content);
      matchedNodes = root.root().findAll(matcher);
    } catch (error) {
      // Never crash the audit on a bad pattern — warn and skip the whole
      // rule, same as loader.ts does for an invalid rule.yaml.
      patternError = `${rule.id}: invalid astgrep pattern (${describeError(error)}) — skipped`;
      break;
    }

    for (const node of matchedNodes) {
      const lineNumber = node.range().start.line + 1;
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

  if (patternError !== undefined) {
    return { findings: [], warnings: [patternError] };
  }

  return { findings, warnings: [...readWarnings] };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
