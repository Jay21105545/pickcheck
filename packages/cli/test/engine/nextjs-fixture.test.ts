import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAudit } from "../../src/engine/audit.js";
import { scanRepo } from "../../src/engine/scan.js";

/**
 * The regression test for DECISIONS/0023: the first real-world run of
 * `pickcheck audit` on a Next.js app returned 49 findings, ~45 of them
 * from .next/server/vendor-chunks/ and .next/static/chunks/ — build
 * output, not source, and completely unactionable.
 *
 * The fixture is a Next.js-shaped repo whose .next/ files are deliberately
 * full of things the ruleset flags (empty catch blocks, console.log, bare
 * fetch, a require in a try). If any of it is ever scanned again, these
 * fail loudly rather than the noise creeping back.
 */
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "nextjs-app",
);
const rulesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../rules");

/**
 * Lists the fixture's .next/ files straight off disk, bypassing scanRepo
 * (which is the thing under test and is supposed to hide them).
 */
async function scanBuildOutputFiles(): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel);
      } else {
        found.push(rel);
      }
    }
  };
  await walk(join(fixtureDir, ".next"), ".next");
  return found.sort();
}

describe("Next.js app fixture", () => {
  it("actually has .next/ build output committed, so the rest isn't vacuous", async () => {
    // The fixture's own .gitignore contains `/.next/` (a real Next.js app
    // has that line — it's the whole point), and git honors nested
    // .gitignore files, so these files had to be force-added. If they ever
    // go missing, every assertion below would pass by scanning nothing.
    const buildOutput = await scanBuildOutputFiles();

    expect(buildOutput.length).toBeGreaterThan(0);
    expect(buildOutput).toContain(".next/static/chunks/polyfills.js");
  });

  it("scans the source files and none of .next/", async () => {
    const files = await scanRepo({ cwd: fixtureDir });

    // .gitignore itself is always excluded (ALWAYS_IGNORED); .next/ is
    // excluded by the default set even though this fixture's .gitignore
    // also covers it.
    expect(files).toEqual([
      "app/api/users/route.ts",
      "components/UserCard.tsx",
      "package.json",
    ]);
    expect(files.filter((file) => file.includes(".next/"))).toEqual([]);
  });

  it("produces zero findings from .next/, on the real shipped ruleset", async () => {
    const result = await runAudit({ cwd: fixtureDir, rulesDir });

    const fromBuildOutput = result.findings.filter((finding) =>
      finding.file.includes(".next/"),
    );

    expect(
      fromBuildOutput,
      `Build output must never be audited. Leaked: ${fromBuildOutput
        .map((f) => `${f.ruleId} @ ${f.file}`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("still audits the app's real source (the fixture isn't passing vacuously)", async () => {
    const result = await runAudit({ cwd: fixtureDir, rulesDir });

    // Proves the scan reached real files rather than returning nothing:
    // this Next.js-shaped repo has an API route but no API.md.
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.findings.map((f) => f.ruleId)).toContain("docs/api-doc-exists");
  });
});
