import { describe, expect, it } from "vitest";
import { computePackageScriptTargets } from "../../src/engine/package-scripts.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("computePackageScriptTargets", () => {
  it("extracts a script's direct file target relative to the repo root", async () => {
    const dir = await createTempDir("pkg-scripts-basic");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { "db:setup": "npx tsx lib/db/setup.ts" } }),
      );

      const targets = await computePackageScriptTargets(dir.path, ["package.json"]);

      expect(targets).toEqual(new Set(["lib/db/setup.ts"]));
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves targets relative to a nested package.json's own directory, not the scanned root", async () => {
    const dir = await createTempDir("pkg-scripts-nested");
    try {
      await dir.write(
        "packages/widgets/package.json",
        JSON.stringify({ scripts: { seed: "tsx lib/db/seed.ts" } }),
      );

      const targets = await computePackageScriptTargets(dir.path, [
        "packages/widgets/package.json",
      ]);

      expect(targets).toEqual(new Set(["packages/widgets/lib/db/seed.ts"]));
    } finally {
      await dir.cleanup();
    }
  });

  it("does not mistake a comma-joined flag value for a file target", async () => {
    const dir = await createTempDir("pkg-scripts-flag");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { lint: "eslint . --ext .ts,.tsx" } }),
      );

      const targets = await computePackageScriptTargets(dir.path, ["package.json"]);

      expect(targets).toEqual(new Set());
    } finally {
      await dir.cleanup();
    }
  });

  it("ignores scripts with no path-like tokens", async () => {
    const dir = await createTempDir("pkg-scripts-none");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "tsc -p .", test: "vitest run" } }),
      );

      const targets = await computePackageScriptTargets(dir.path, ["package.json"]);

      expect(targets).toEqual(new Set());
    } finally {
      await dir.cleanup();
    }
  });

  it("returns an empty set when there's no package.json among scannedFiles", async () => {
    const targets = await computePackageScriptTargets("/does/not/exist", ["src/a.ts"]);
    expect(targets).toEqual(new Set());
  });

  it("returns an empty set for a package.json with no scripts field", async () => {
    const dir = await createTempDir("pkg-scripts-no-scripts-field");
    try {
      await dir.write("package.json", JSON.stringify({ name: "x" }));

      const targets = await computePackageScriptTargets(dir.path, ["package.json"]);

      expect(targets).toEqual(new Set());
    } finally {
      await dir.cleanup();
    }
  });

  it("collects targets from every package.json among scannedFiles, not just the first", async () => {
    const dir = await createTempDir("pkg-scripts-multi");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { seed: "tsx db/seed.ts" } }),
      );
      await dir.write(
        "packages/api/package.json",
        JSON.stringify({ scripts: { migrate: "tsx scripts/migrate.ts" } }),
      );

      const targets = await computePackageScriptTargets(dir.path, [
        "package.json",
        "packages/api/package.json",
      ]);

      expect(targets).toEqual(
        new Set(["db/seed.ts", "packages/api/scripts/migrate.ts"]),
      );
    } finally {
      await dir.cleanup();
    }
  });
});
