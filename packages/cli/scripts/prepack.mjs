#!/usr/bin/env node
// Copies the monorepo root's README.md and LICENSE into packages/cli/
// right before packing/publishing (npm's "prepack" lifecycle hook covers
// both `npm pack` and `npm publish`). One source of truth for both files
// — this package never carries a hand-maintained duplicate that could
// drift from the real one — at the cost of these two files not existing
// here between publishes; see .gitignore.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(packageDir, "..", "..");

for (const file of ["README.md", "LICENSE"]) {
  copyFileSync(join(repoRoot, file), join(packageDir, file));
}
