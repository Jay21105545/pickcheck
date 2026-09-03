import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { debounce } from "lodash";
// Subpath import — the package name is "lodash", already declared above.
import debounceFn from "lodash/debounce";
// Scoped subpath import — the package name is "@pickcheck/rules", declared
// via its workspace-protocol version string, which still counts as declared.
import type { Rule } from "@pickcheck/rules/schema";
// Type-only import of an ordinary declared devDependency.
import type { Command } from "commander";
// tsconfig/Next.js-style local path alias, not an npm scope.
import { Button } from "@/components/Button";
// Ordinary relative import — never a package, never checked.
import { helper } from "./helper";

export function describe(command: Command): Rule | undefined {
  fs.existsSync(join(".", "package.json"));
  void readFile("package.json");
  void debounce;
  void debounceFn;
  void Button;
  void helper;
  return undefined;
}
