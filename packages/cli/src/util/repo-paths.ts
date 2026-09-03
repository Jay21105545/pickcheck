import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Resolves to packages/cli itself via Node's package self-reference (the
 * "./package.json" export below), which — unlike a relative path from this
 * file's own location — resolves identically whether this code is running
 * from src/ under tsx or from the bundled dist/index.js, at any nesting
 * depth tsup's bundler happens to produce.
 */
function cliPackageDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve("pickcheck/package.json"));
}

/**
 * docs-kit/ and generators/ ship as siblings of packages/ per
 * ARCHITECTURE.md's monorepo layout, not inside packages/cli — so unlike
 * @pickcheck/rules (its own workspace package, resolved as a dependency),
 * they're located relative to the repo root, two levels up from
 * packages/cli.
 */
function repoRoot(): string {
  return join(cliPackageDir(), "..", "..");
}

/** Templates copied verbatim (with {{TOKEN}} substitution) by `pickcheck init`. */
export function docsKitDir(): string {
  return join(repoRoot(), "docs-kit");
}

/** Prompt templates used by `pickcheck gen <type>`. */
export function generatorsDir(): string {
  return join(repoRoot(), "generators");
}
