import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the published artifact against the class of bug that made 0.1.0
 * uninstallable (DECISIONS/0021). Every assertion here maps to a specific
 * way that release was broken:
 *
 * 1. `workspace:^` in `dependencies` -> npm EUNSUPPORTEDPROTOCOL, install
 *    fails outright.
 * 2. `@pickcheck/*` left as a runtime import in the bundle -> the code is
 *    a devDependency a consumer never receives, so module-not-found.
 * 3. rule.yaml / docs-kit / generators not shipped -> zero rules, and
 *    `init`/`gen` crash with ENOENT.
 *
 * These run against the real files on disk rather than mocks, because the
 * whole failure mode was "everything passes locally, nothing works when
 * installed."
 */
const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf-8"),
) as {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  files?: string[];
};

/** The fields npm actually resolves when a consumer installs the package. */
const INSTALL_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

/** pnpm/yarn-only specifier protocols npm cannot resolve from the registry. */
const LOCAL_PROTOCOL = /^(workspace|link|portal|file):/;

describe("publishable package manifest", () => {
  for (const field of INSTALL_FIELDS) {
    it(`has no local-protocol specifiers in ${field}`, () => {
      const offenders = Object.entries(packageJson[field] ?? {}).filter(([, range]) =>
        LOCAL_PROTOCOL.test(range),
      );

      expect(
        offenders,
        `${field} must only contain registry-resolvable ranges — npm fails with EUNSUPPORTEDPROTOCOL otherwise. Offending: ${offenders
          .map(([name, range]) => `${name}@${range}`)
          .join(", ")}`,
      ).toEqual([]);
    });
  }

  it("declares every dependency with a valid semver-ish range", () => {
    for (const field of INSTALL_FIELDS) {
      for (const [name, range] of Object.entries(packageJson[field] ?? {})) {
        expect(
          range,
          `${field}.${name} should be a registry range like "^1.2.3"`,
        ).toMatch(/^[\^~]?\d+\.\d+\.\d+/);
      }
    }
  });

  it("keeps the internal workspace packages out of the install graph entirely", () => {
    for (const field of INSTALL_FIELDS) {
      const internal = Object.keys(packageJson[field] ?? {}).filter((name) =>
        name.startsWith("@pickcheck/"),
      );
      expect(
        internal,
        `@pickcheck/* packages are private and never published — they must be devDependencies bundled into dist/, not ${field}`,
      ).toEqual([]);
    }
  });
});

describe("built bundle", () => {
  // Reads whatever the last `pnpm build` produced. CI always builds before
  // testing (self-audit does), so this reflects the artifact that ships.
  const distDir = join(packageDir, "dist");

  it("has no unresolved @pickcheck/* imports left in the bundle", () => {
    const entry = readFileSync(join(distDir, "index.js"), "utf-8");
    const chunks = execFileSync("find", [distDir, "-maxdepth", "1", "-name", "*.js"], {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .map((file) => readFileSync(file, "utf-8"))
      .join("\n");

    // A static `from "@pickcheck/..."` or dynamic `import("@pickcheck/...")`
    // in the output means that code was NOT inlined and will be missing at
    // runtime for anyone who installed from npm.
    expect(entry + chunks).not.toMatch(/from\s*"@pickcheck\//);
    expect(entry + chunks).not.toMatch(/import\(\s*"@pickcheck\//);
  });

  it("ships the runtime data assets the CLI reads off disk", () => {
    // Rules are globbed by loadRules(); docs-kit and generators are read
    // by `init` and `gen`. All three are data, not modules — esbuild
    // cannot inline them, so they have to be copied into dist/.
    const ruleFiles = execFileSync(
      "find",
      [join(distDir, "rules"), "-name", "rule.yaml"],
      { encoding: "utf-8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(ruleFiles.length).toBeGreaterThan(0);
    expect(
      readFileSync(join(distDir, "docs-kit", "CHANGELOG.md"), "utf-8"),
    ).toBeTruthy();
    expect(readFileSync(join(distDir, "generators", "api.md"), "utf-8")).toBeTruthy();
  });

  it("ships dist/ in the files whitelist so those assets actually reach npm", () => {
    expect(packageJson.files).toContain("dist");
  });
});
