import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readEnginesNode, unsupportedNodeVersion } from "../src/preflight.js";
import { createTempDir } from "./helpers/temp-dir.js";

/**
 * DECISIONS/0025. Three layers, because the feature is only as good as
 * its weakest one:
 *
 * 1. the comparison itself,
 * 2. the *structure* that lets it run at all — nothing may be statically
 *    imported ahead of it, in source or in the built bundle,
 * 3. the end-to-end behaviour, run as a real process against a staged
 *    copy of the built package with a floor no runtime can satisfy.
 *
 * Layer 2 is the one that rots silently: adding `import { Command } from
 * "commander"` back to the bin entry would leave every unit test green
 * while disabling the gate completely, since static imports are hoisted
 * and evaluated before any of a module's own statements run.
 */
const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const enginesFixtures = join(packageDir, "test", "fixtures", "engines");

describe("unsupportedNodeVersion", () => {
  it("accepts a runtime exactly at the floor", () => {
    expect(unsupportedNodeVersion("v22.12.0", ">=22.12.0")).toBeUndefined();
  });

  it("accepts a runtime above the floor", () => {
    expect(unsupportedNodeVersion("v24.0.1", ">=22.12.0")).toBeUndefined();
  });

  it("rejects a runtime a whole major below the floor", () => {
    expect(unsupportedNodeVersion("v18.20.7", ">=22.12.0")).toEqual({
      required: ">=22.12.0",
      actual: "v18.20.7",
    });
  });

  it("compares minor, not just major — the floor is 22.12, not 22", () => {
    expect(unsupportedNodeVersion("v22.11.0", ">=22.12.0")).toEqual({
      required: ">=22.12.0",
      actual: "v22.11.0",
    });
    expect(unsupportedNodeVersion("v22.12.0", ">=22.12.0")).toBeUndefined();
  });

  it("compares patch too", () => {
    expect(unsupportedNodeVersion("v22.12.0", ">=22.12.1")).toEqual({
      required: ">=22.12.1",
      actual: "v22.12.0",
    });
    expect(unsupportedNodeVersion("v22.12.1", ">=22.12.1")).toBeUndefined();
  });

  it("returns both versions verbatim, so the message can name each of them", () => {
    const unsupported = unsupportedNodeVersion("v20.11.1", ">=22.12.0");

    expect(unsupported?.actual).toBe("v20.11.1");
    expect(unsupported?.required).toBe(">=22.12.0");
  });

  it("reads a bare floor with no comparator, and a partial one", () => {
    expect(unsupportedNodeVersion("v20.11.1", "22.12.0")).toBeDefined();
    expect(unsupportedNodeVersion("v20.11.1", ">=22")).toBeDefined();
    expect(unsupportedNodeVersion("v22.0.0", ">=22")).toBeUndefined();
  });

  it("stays out of the way when the floor can't be established", () => {
    // A gate that can't tell what it's enforcing must let the user
    // through: blocking on a guess turns a packaging slip into an
    // unrunnable CLI, which is worse than the advisory `engines`
    // behaviour it backstops.
    expect(unsupportedNodeVersion("v18.20.7", undefined)).toBeUndefined();
    expect(unsupportedNodeVersion("v18.20.7", 22)).toBeUndefined();
    expect(unsupportedNodeVersion("v18.20.7", "")).toBeUndefined();
    expect(unsupportedNodeVersion("v18.20.7", "*")).toBeUndefined();
  });

  it("takes the first bound of a compound range — laxer, never stricter", () => {
    expect(unsupportedNodeVersion("v20.11.1", "^20 || >=22")).toBeUndefined();
  });

  it("passes an unparsable runtime version rather than guessing", () => {
    expect(unsupportedNodeVersion("unknown", ">=22.12.0")).toBeUndefined();
  });
});

describe("readEnginesNode", () => {
  it("reads engines.node out of a manifest", () => {
    expect(readEnginesNode(join(enginesFixtures, "declared", "package.json"))).toBe(
      ">=22.12.0",
    );
  });

  it("returns undefined when engines is absent", () => {
    expect(
      readEnginesNode(join(enginesFixtures, "no-engines", "package.json")),
    ).toBeUndefined();
  });

  it("returns undefined when engines.node isn't a string", () => {
    expect(
      readEnginesNode(join(enginesFixtures, "non-string", "package.json")),
    ).toBeUndefined();
  });

  it("returns undefined for a malformed manifest rather than throwing", () => {
    expect(
      readEnginesNode(join(enginesFixtures, "malformed", "package.json")),
    ).toBeUndefined();
  });

  it("returns undefined for a missing manifest rather than throwing", () => {
    expect(
      readEnginesNode(join(enginesFixtures, "nonexistent", "package.json")),
    ).toBeUndefined();
  });

  it("reads this package's own declared floor, which is what ships", () => {
    const declared = readEnginesNode(join(packageDir, "package.json"));

    expect(declared).toBeDefined();
    // Whatever the floor becomes, the gate must agree with the manifest
    // npm enforces — that single source of truth is the point of reading
    // it at runtime instead of hardcoding it (DECISIONS/0024, 0025).
    expect(unsupportedNodeVersion(process.version, declared)).toBeUndefined();
  });
});

/**
 * Collects the specifiers of every *static* import in a module — both
 * `import … from "x"` and bare `import "x"`.
 */
function staticImportSpecifiers(source: string): string[] {
  const fromImports = [...source.matchAll(/^import\s[^;]*?\sfrom\s+"([^"]+)"/gm)];
  const bareImports = [...source.matchAll(/^import\s+"([^"]+)"/gm)];
  return [...fromImports, ...bareImports].map((match) => match[1] as string);
}

describe("bin entry structure", () => {
  const indexSource = readFileSync(join(packageDir, "src", "index.ts"), "utf-8");
  const preflightSource = readFileSync(
    join(packageDir, "src", "preflight.ts"),
    "utf-8",
  );

  it("statically imports only node: builtins and the preflight module", () => {
    const specifiers = staticImportSpecifiers(indexSource);

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(
        specifier.startsWith("node:") || specifier === "./preflight.js",
        `src/index.ts statically imports "${specifier}". Static imports are hoisted and evaluated before the version gate below them can run — on exactly the runtimes the gate exists to reject. Load it with await import() after the check instead.`,
      ).toBe(true);
    }
  });

  it("loads the CLI through a dynamic import, never a static one", () => {
    expect(indexSource).toMatch(/await import\("\.\/cli\.js"\)/);
    expect(staticImportSpecifiers(indexSource)).not.toContain("./cli.js");
  });

  it("keeps preflight.ts itself to node: builtins", () => {
    for (const specifier of staticImportSpecifiers(preflightSource)) {
      expect(
        specifier.startsWith("node:"),
        `src/preflight.ts imports "${specifier}". This module has to *run* on the runtimes it rejects, so it can only use builtins that predate the floor.`,
      ).toBe(true);
    }
  });
});

describe("built bin entry", () => {
  // Reads what `pnpm build` produced, like publishable-package.test.ts —
  // CI builds before it tests for exactly this reason.
  const distDir = join(packageDir, "dist");
  const entrySource = readFileSync(join(distDir, "index.js"), "utf-8");

  it("has no static commander import left in the entry chunk", () => {
    expect(entrySource).not.toMatch(/from\s*"commander"/);
  });

  it("bootstraps the CLI with exactly one dynamic import", () => {
    const dynamicImports = [
      ...entrySource.matchAll(/import\(\s*"\.\/([^"]+\.js)"\s*\)/g),
    ].map((match) => match[1] as string);

    expect(dynamicImports).toHaveLength(1);
  });

  /**
   * Stages a copy of the built package with a substituted `engines.node`,
   * so the gate can be driven past its own threshold in both directions
   * on whatever Node the suite happens to be running — the real manifest
   * declares one fixed floor, and half of what needs testing is on the
   * other side of it.
   *
   * `node_modules` is symlinked rather than copied because the bundle
   * keeps its real dependencies external: without it the pass path dies
   * with ERR_MODULE_NOT_FOUND on commander. (Which is itself a small
   * confirmation that the reject path fires *before* the CLI chunk loads
   * — that run never hits this at all.)
   */
  async function stagePackage(engines: string) {
    const stage = await createTempDir("preflight-stage");
    await cp(distDir, join(stage.path, "dist"), { recursive: true });
    await symlink(join(packageDir, "node_modules"), join(stage.path, "node_modules"));
    await stage.write(
      "package.json",
      JSON.stringify({
        name: "pickcheck",
        version: "0.0.0-preflight-fixture",
        type: "module",
        engines: { node: engines },
      }),
    );
    return stage;
  }

  it("exits 1 naming both the required and the running version", async () => {
    const stage = await stagePackage(">=999.0.0");
    try {
      const run = spawnSync(
        process.execPath,
        [join(stage.path, "dist", "index.js"), "--version"],
        { encoding: "utf-8" },
      );

      expect(run.status).toBe(1);
      expect(run.stderr).toContain(">=999.0.0");
      expect(run.stderr).toContain(process.version);
      // Nothing from the CLI itself: the gate has to fire before
      // commander parses argv, or `--version` would answer first.
      expect(run.stdout).toBe("");
    } finally {
      await stage.cleanup();
    }
  }, 30_000);

  it("runs the CLI normally when the runtime satisfies the floor", async () => {
    const stage = await stagePackage(">=0.0.0");
    try {
      const run = spawnSync(
        process.execPath,
        [join(stage.path, "dist", "index.js"), "--version"],
        { encoding: "utf-8" },
      );

      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");
      // Proves cli.js was actually reached, and read the staged manifest.
      expect(run.stdout.trim()).toBe("0.0.0-preflight-fixture");
    } finally {
      await stage.cleanup();
    }
  }, 30_000);
});
