import type { ManifestRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runManifestTier } from "../../../src/engine/tiers/manifest.js";
import { createTempDir } from "../../helpers/temp-dir.js";

function rule(overrides: Partial<ManifestRule> = {}): ManifestRule {
  return {
    id: "sec/no-hallucinated-imports",
    category: "security",
    severity: "error",
    title: "Import of an undeclared package",
    files: ["**/*.ts"],
    message: "This package isn't declared in package.json.",
    weight: 4,
    tier: "manifest",
    pattern: {
      regex:
        "(?:\\bfrom\\s+|\\brequire\\(\\s*|\\bimport\\(\\s*|\\bimport\\s+)['\"]([^'\"]+)['\"]",
      manifestFile: "package.json",
      dependencyFields: ["dependencies", "devDependencies"],
    },
    ...overrides,
  };
}

describe("runManifestTier", () => {
  it("flags a bare specifier absent from package.json", async () => {
    const dir = await createTempDir("manifest-hallucinated");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write("src/a.ts", "import { thing } from 'left-pad-plus-plus';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.warnings).toEqual([]);
      expect(result.findings).toEqual([
        expect.objectContaining({ file: "src/a.ts", line: 1 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not flag a declared dependency", async () => {
    const dir = await createTempDir("manifest-declared");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write("src/a.ts", "import { debounce } from 'lodash';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves a subpath import to its package name", async () => {
    const dir = await createTempDir("manifest-subpath");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write("src/a.ts", "import debounce from 'lodash/debounce';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves a scoped subpath import to its scope/name package", async () => {
    const dir = await createTempDir("manifest-scoped-subpath");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { "@pickcheck/rules": "workspace:^" } }),
      );
      await dir.write(
        "src/a.ts",
        "import { ruleSchema } from '@pickcheck/rules/schema';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("exempts node: builtins, including builtin subpaths", async () => {
    const dir = await createTempDir("manifest-builtins");
    try {
      await dir.write("package.json", JSON.stringify({ dependencies: {} }));
      await dir.write(
        "src/a.ts",
        "import fs from 'node:fs';\nimport { join } from 'node:path';\nimport { readFile } from 'node:fs/promises';\nimport path from 'path';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("exempts relative imports and @/-style path aliases", async () => {
    const dir = await createTempDir("manifest-relative");
    try {
      await dir.write("package.json", JSON.stringify({ dependencies: {} }));
      await dir.write(
        "src/a.ts",
        "import { helper } from './helper';\nimport { Button } from '@/components/Button';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("skips a file (never crashes) when no ancestor manifest exists up to the scanned root", async () => {
    const dir = await createTempDir("manifest-missing");
    try {
      await dir.write("src/a.ts", "import { thing } from 'nonexistent-package';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["src/a.ts"],
      });

      expect(result.findings).toEqual([]);
      expect(result.warnings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves a package-level dependency the workspace root doesn't declare — monorepo-safe", async () => {
    const dir = await createTempDir("manifest-monorepo-nearest");
    try {
      // A workspace root manifest that does NOT declare "left-pad" —
      // only the nested package's own package.json does. Reading only
      // the root would wrongly flag every file in packages/widgets.
      await dir.write(
        "package.json",
        JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      );
      await dir.write(
        "packages/widgets/package.json",
        JSON.stringify({ dependencies: { "left-pad": "^1.0.0" } }),
      );
      await dir.write(
        "packages/widgets/src/pad.ts",
        "import leftPad from 'left-pad';\nimport { thing } from 'not-declared-anywhere';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: [
          "package.json",
          "packages/widgets/package.json",
          "packages/widgets/src/pad.ts",
        ],
      });

      expect(result.findings).toEqual([
        expect.objectContaining({ file: "packages/widgets/src/pad.ts", line: 2 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("also resolves a devDependency declared only at the workspace root — tooling-config-safe", async () => {
    const dir = await createTempDir("manifest-monorepo-root-dep");
    try {
      // packages/cli's own package.json doesn't list "tsup" — only the
      // workspace root does, exactly like this repo's real
      // packages/cli/tsup.config.ts importing the root's "tsup"
      // devDependency. "Nearest ancestor wins" would stop at
      // packages/cli/package.json and miss it; the root must still be
      // unioned in.
      await dir.write(
        "package.json",
        JSON.stringify({ devDependencies: { tsup: "^8.0.0" } }),
      );
      await dir.write(
        "packages/cli/package.json",
        JSON.stringify({ dependencies: { commander: "^15.0.0" } }),
      );
      await dir.write(
        "packages/cli/tsup.config.ts",
        "import { defineConfig } from 'tsup';\nexport default defineConfig({});\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: [
          "package.json",
          "packages/cli/package.json",
          "packages/cli/tsup.config.ts",
        ],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });
});
