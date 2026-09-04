import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAudit } from "../../src/engine/audit.js";
import { scanRepo } from "../../src/engine/scan.js";

/**
 * The regression test for DECISIONS/0026: `cd packages/cli && pickcheck
 * audit` reported `tsup.config.ts`'s `import { defineConfig } from "tsup"`
 * as a hallucinated import, because `tsup` is a devDependency of the
 * monorepo ROOT and manifest resolution stopped at the scan root.
 *
 * Auditing a subdirectory is not an exotic case — it is what anyone with
 * a monorepo does when they want a score for one package. Our own
 * self-audit never caught this because it only ever runs from the repo
 * root, where the root manifest is inside the walk already. Both halves
 * of that gap are covered below: a fixture workspace, and this repo.
 */
const here = dirname(fileURLToPath(import.meta.url));
const rulesDir = join(here, "../../../rules");
const widgetDir = join(
  here,
  "..",
  "fixtures",
  "workspace-package",
  "packages",
  "widget",
);
const cliPackageDir = join(here, "..", "..");

const HALLUCINATED_IMPORTS = "sec/no-hallucinated-imports";

describe("auditing a workspace package from inside it", () => {
  it("scans the package's own files, not the workspace root's", async () => {
    const files = await scanRepo({ cwd: widgetDir });

    expect(files.sort()).toEqual(["package.json", "src/index.ts", "tsup.config.ts"]);
  });

  it("resolves a devDependency declared only at the workspace root above it", async () => {
    const result = await runAudit({ cwd: widgetDir, rulesDir });

    const onConfig = result.findings.filter(
      (finding) =>
        finding.ruleId === HALLUCINATED_IMPORTS && finding.file === "tsup.config.ts",
    );

    expect(
      onConfig,
      "`tsup` is declared at the fixture's workspace root — resolution has to walk above the scan root to see it",
    ).toEqual([]);
  });

  it("still flags a package declared nowhere, so the guarantee above isn't blanket", async () => {
    const result = await runAudit({ cwd: widgetDir, rulesDir });

    expect(
      result.findings.filter((finding) => finding.ruleId === HALLUCINATED_IMPORTS),
    ).toEqual([expect.objectContaining({ file: "src/index.ts", line: 6 })]);
  });
});

describe("auditing this repo's own packages/cli from inside it", () => {
  it("reports no hallucinated imports, on the real shipped ruleset", async () => {
    const result = await runAudit({ cwd: cliPackageDir, rulesDir });

    const hallucinated = result.findings.filter(
      (finding) => finding.ruleId === HALLUCINATED_IMPORTS,
    );

    expect(
      hallucinated,
      `Every one of these resolves for real from packages/cli. Leaked: ${hallucinated
        .map((finding) => `${finding.file}:${finding.line}`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("actually loaded the rule and reached tsup.config.ts, so that isn't vacuous", async () => {
    const files = await scanRepo({ cwd: cliPackageDir });
    const result = await runAudit({ cwd: cliPackageDir, rulesDir });

    expect(files).toContain("tsup.config.ts");
    expect(result.rules.map((rule) => rule.id)).toContain(HALLUCINATED_IMPORTS);
  });
});
