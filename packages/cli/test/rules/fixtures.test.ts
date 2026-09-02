import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleSchema } from "@pickcheck/rules/schema";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { scanRepo } from "../../src/engine/scan.js";
import { dispatchTier } from "../../src/engine/tiers/index.js";

/**
 * Auto-discovers every rule folder under packages/rules and asserts both
 * fixture directions: fixtures/bad must produce at least one finding for
 * that rule, fixtures/good must produce none. A rule missing either
 * directory (or a valid rule.yaml) fails here rather than being silently
 * skipped — scanRepo() on a missing directory returns no files, so a
 * missing fixtures/bad yields zero findings and fails the "must trigger"
 * assertion the same way an empty one would.
 */
const rulesRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../rules");
const ruleFiles = fg.sync("**/rule.yaml", { cwd: rulesRoot, absolute: true }).sort();

describe("rule fixtures", () => {
  it("discovers at least one rule under packages/rules", () => {
    expect(ruleFiles.length).toBeGreaterThan(0);
  });

  for (const ruleFile of ruleFiles) {
    const ruleDir = dirname(ruleFile);
    const label = relative(rulesRoot, ruleDir);
    const parsed = ruleSchema.safeParse(parseYaml(readFileSync(ruleFile, "utf-8")));

    describe(label, () => {
      it("has a valid rule.yaml", () => {
        expect(
          parsed.success,
          parsed.success ? undefined : JSON.stringify(parsed.error.issues, null, 2),
        ).toBe(true);
      });

      // A rule.yaml that fails validation already fails the assertion above;
      // registering the fixture tests only when parsing succeeded avoids a
      // confusing second failure with no rule to run.
      if (parsed.success) {
        const rule = parsed.data;

        it("triggers on its fixtures/bad samples", async () => {
          const cwd = join(ruleDir, "fixtures/bad");
          const scannedFiles = await scanRepo({ cwd });
          const result = await dispatchTier(rule, { cwd, scannedFiles });

          expect(
            result.findings.length,
            `expected ${rule.id} to produce at least one finding on its fixtures/bad samples`,
          ).toBeGreaterThan(0);
        });

        it("stays quiet on its fixtures/good samples", async () => {
          const cwd = join(ruleDir, "fixtures/good");
          const scannedFiles = await scanRepo({ cwd });
          const result = await dispatchTier(rule, { cwd, scannedFiles });

          expect(
            result.findings,
            `expected ${rule.id} to produce no findings on its fixtures/good samples`,
          ).toEqual([]);
        });
      }
    });
  }
});
