import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
 * docs-kit/ and generators/ are runtime *data* (templates read off disk),
 * and they live at the monorepo root — outside the published package. So
 * `scripts/copy-runtime-assets.mjs` copies them into dist/ at build time
 * and `files: ["dist"]` ships them; that copy is the only one a consumer
 * who installed from npm has.
 *
 * Two contexts, checked in order, same as audit.ts's defaultRulesDir():
 * the shipped copy next to the running bundle first, then the monorepo
 * layout for source runs (tsx, vitest, `pnpm dev`) where dist/ may be
 * absent or stale. Before 0.1.1 only the monorepo branch existed, so
 * `init`/`gen` crashed with ENOENT for every real install — the repo-root
 * arithmetic below lands on the *consumer's* project root, where no
 * docs-kit/ exists. See DECISIONS/0021.
 */
function assetDir(name: string): string {
  const shipped = join(dirname(fileURLToPath(import.meta.url)), name);
  if (existsSync(shipped)) {
    return shipped;
  }
  return join(cliPackageDir(), "..", "..", name);
}

/** Templates copied verbatim (with {{TOKEN}} substitution) by `pickcheck init`. */
export function docsKitDir(): string {
  return assetDir("docs-kit");
}

/** Prompt templates used by `pickcheck gen <type>`. */
export function generatorsDir(): string {
  return assetDir("generators");
}
