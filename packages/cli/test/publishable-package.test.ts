import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
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
  // Reads what `pnpm build` produced — CI runs a build step before `pnpm
  // test` for exactly this reason (see .github/workflows/ci.yml). If dist/
  // is missing these fail loudly rather than silently skipping, since a
  // skipped artifact guard is how 0.1.0 shipped broken in the first place.
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

/**
 * Every workflow that runs `pnpm test` must build first, because the
 * artifact guards above read dist/. Adding that step to ci.yml but not
 * release.yml is what left Release red for three commits while CI went
 * green — the same one-line omission, twice, in two files that have to
 * stay in step. Cheaper to assert than to notice.
 */
describe("CI workflows", () => {
  const workflowsDir = join(packageDir, "..", "..", ".github", "workflows");

  for (const workflow of ["ci.yml", "release.yml"]) {
    it(`${workflow} builds before it tests`, () => {
      const yaml = readFileSync(join(workflowsDir, workflow), "utf-8");
      const buildAt = yaml.indexOf("run: pnpm build");
      const testAt = yaml.indexOf("run: pnpm test");

      expect(buildAt, `${workflow} has no \`pnpm build\` step`).toBeGreaterThan(-1);
      expect(testAt, `${workflow} has no \`pnpm test\` step`).toBeGreaterThan(-1);
      expect(
        buildAt,
        `${workflow} runs \`pnpm test\` before \`pnpm build\`, so the dist/ guards above will fail on a fresh checkout`,
      ).toBeLessThan(testAt);
    });
  }
});

/**
 * ARCHITECTURE.md budgets the bin entry at "< 50ms before command
 * dispatch". This guards that budget by asserting on the *size of the
 * eagerly-loaded module graph* rather than by timing anything.
 *
 * Timing was evaluated first and rejected as a CI gate (DECISIONS/0022):
 * an absolute-millisecond threshold is machine-speed-dependent, and
 * subtracting a `node -e ""` baseline only cancels a constant offset, not
 * the proportional scaling of the import work itself — a contended runner
 * at half speed reports ~2x the import cost with nothing actually
 * regressed. `scripts/measure-startup.mjs` keeps that measurement
 * available as a local diagnostic; this is the part that can gate CI
 * without flaking, because bytes are deterministic.
 *
 * It catches the real regression directly: a heavy module landing back on
 * the startup path. Loading zod eagerly (the 0.1.1 regression this
 * replaced) added ~713KB and ~18ms — three orders of magnitude past the
 * noise floor of a byte count.
 */
describe("bin entry startup budget", () => {
  const distDir = join(packageDir, "dist");

  /**
   * Generous next to the ~68KB the entry graph actually weighs — this is
   * a tripwire for "someone put a 700KB dependency back on the startup
   * path", not a golden-file size assertion that needs updating whenever
   * a few lines of CLI code are added.
   */
  const EAGER_GRAPH_BUDGET_KB = 150;

  it("keeps the eagerly-imported graph small enough to hit the startup budget", () => {
    const entrySource = readFileSync(join(distDir, "index.js"), "utf-8");

    // Only STATIC imports load at startup. A dynamic `import()` — how
    // ruleSchema/zod, @ast-grep/napi, gpt-tokenizer and the HTML report
    // are all loaded — costs nothing until the command that needs it runs.
    const staticChunks = new Set(
      [...entrySource.matchAll(/from\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1] as string),
    );

    let totalBytes = statSync(join(distDir, "index.js")).size;
    for (const chunk of staticChunks) {
      totalBytes += statSync(join(distDir, chunk)).size;
    }
    const totalKb = totalBytes / 1024;

    expect(
      totalKb,
      `The bin entry eagerly loads ${totalKb.toFixed(1)}KB across index.js + ${staticChunks.size} chunk(s), over the ${EAGER_GRAPH_BUDGET_KB}KB tripwire. Something heavy moved onto the startup path — check for a new top-level import that should be a dynamic import() instead (see loader.ts's ruleSchema for the pattern).`,
    ).toBeLessThan(EAGER_GRAPH_BUDGET_KB);
  });

  it("keeps zod off the startup path specifically", () => {
    const entrySource = readFileSync(join(distDir, "index.js"), "utf-8");
    const staticChunks = [...entrySource.matchAll(/from\s*"\.\/([^"]+\.js)"/g)].map(
      (m) => m[1] as string,
    );

    const eagerSource =
      entrySource +
      staticChunks
        .map((chunk) => readFileSync(join(distDir, chunk), "utf-8"))
        .join("\n");

    // zod's runtime is unmistakable in a bundle; if these appear in the
    // eager graph, the rule schema is being imported at module scope again.
    expect(eagerSource).not.toMatch(/ZodError/);
    expect(eagerSource).not.toMatch(/\$ZodType/);
  });
});
