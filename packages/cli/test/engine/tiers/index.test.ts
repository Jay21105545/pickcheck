import type { AstgrepRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { dispatchTier } from "../../../src/engine/tiers/index.js";
import { createTempDir } from "../../helpers/temp-dir.js";

function consoleLogRule(overrides: Partial<AstgrepRule> = {}): AstgrepRule {
  return {
    id: "disc/no-console-log",
    category: "discipline",
    severity: "warn",
    title: "console.log left in source",
    files: ["**/*.ts"],
    message: "console.log left in source.",
    weight: 1,
    tier: "astgrep",
    pattern: { rule: { pattern: "console.log($$$ARGS)" } },
    ...overrides,
  } as AstgrepRule;
}

describe("dispatchTier — excludePackageScriptTargets", () => {
  it("does not flag a file that's the direct execution target of a package.json script", async () => {
    const dir = await createTempDir("dispatch-script-target");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { "db:setup": "npx tsx lib/db/setup.ts" } }),
      );
      await dir.write("lib/db/setup.ts", "console.log('setting up...');\n");

      const result = await dispatchTier(
        consoleLogRule({ excludePackageScriptTargets: true }),
        { cwd: dir.path, scannedFiles: ["package.json", "lib/db/setup.ts"] },
      );

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("still flags the same file when the rule doesn't opt into the exclusion", async () => {
    const dir = await createTempDir("dispatch-script-target-optout");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { "db:setup": "npx tsx lib/db/setup.ts" } }),
      );
      await dir.write("lib/db/setup.ts", "console.log('setting up...');\n");

      const result = await dispatchTier(consoleLogRule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "lib/db/setup.ts"],
      });

      expect(result.findings).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });

  it("still flags a file unrelated to any script target", async () => {
    const dir = await createTempDir("dispatch-script-target-unrelated");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "tsc -p ." } }),
      );
      await dir.write("src/app.ts", "console.log('left in app code');\n");

      const result = await dispatchTier(
        consoleLogRule({ excludePackageScriptTargets: true }),
        { cwd: dir.path, scannedFiles: ["package.json", "src/app.ts"] },
      );

      expect(result.findings).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });
});
