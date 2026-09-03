#!/usr/bin/env node
// Copies every runtime *data* asset into dist/ as the last step of
// `build`, so `files: ["dist"]` ships them to npm consumers:
//
//   packages/rules/**/rule.yaml -> dist/rules/**   (loadRules globs these)
//   docs-kit/**                 -> dist/docs-kit/  (`pickcheck init`)
//   generators/**               -> dist/generators/(`pickcheck gen`)
//
// None of these can be inlined by esbuild: they're data read off disk at
// runtime, not modules. Before 0.1.1 none of them shipped at all — rules
// lived in a private, never-published workspace package, and docs-kit/
// and generators/ sat at the monorepo root, outside the published
// package entirely. A real `npm install pickcheck` therefore had zero
// rules and crashed on `init`/`gen` with ENOENT. See DECISIONS/0021.
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(packageDir, "..", "..");
const distDir = join(packageDir, "dist");

/** Recursively collect files, skipping noise and anything `keep` rejects. */
async function collect(dir, keep = () => true) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "_incubating") continue;
    if (entry.name === ".DS_Store") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collect(full, keep)));
    } else if (keep(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

async function copyTree(srcDir, outName, keep) {
  const outDir = join(distDir, outName);
  await rm(outDir, { recursive: true, force: true });
  const files = await collect(srcDir, keep);
  for (const file of files) {
    const target = join(outDir, relative(srcDir, file));
    await mkdir(dirname(target), { recursive: true });
    await cp(file, target);
  }
  return files.length;
}

// Only rule.yaml is read at runtime — a rule's README and fixtures are
// repo/docs content, and shipping them would bloat the tarball.
const rules = await copyTree(
  join(repoRoot, "packages", "rules"),
  "rules",
  (n) => n === "rule.yaml",
);
const docsKit = await copyTree(join(repoRoot, "docs-kit"), "docs-kit");
const generators = await copyTree(join(repoRoot, "generators"), "generators");

process.stdout.write(
  `copy-runtime-assets: ${rules} rule.yaml, ${docsKit} docs-kit, ${generators} generators -> dist/\n`,
);
