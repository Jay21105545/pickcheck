import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/engine/scan.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("scanRepo", () => {
  it("lists files, sorted, relative to cwd", async () => {
    const dir = await createTempDir("scan-basic");
    try {
      await dir.write("a.ts", "");
      await dir.write("nested/b.ts", "");

      const files = await scanRepo({ cwd: dir.path });

      expect(files).toEqual(["a.ts", "nested/b.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("always ignores .git and node_modules, even without a .gitignore", async () => {
    const dir = await createTempDir("scan-always-ignored");
    try {
      await dir.write("src/index.ts", "");
      await dir.write(".git/HEAD", "ref: refs/heads/main");
      await dir.write("node_modules/left-pad/index.js", "");

      const files = await scanRepo({ cwd: dir.path });

      expect(files).toEqual(["src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("honors .gitignore patterns", async () => {
    const dir = await createTempDir("scan-gitignore");
    try {
      await dir.write(".gitignore", "dist/\n*.log\n");
      await dir.write("src/index.ts", "");
      await dir.write("dist/index.js", "");
      await dir.write("debug.log", "");

      const files = await scanRepo({ cwd: dir.path });

      expect(files).toEqual(["src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("works with no .gitignore present", async () => {
    const dir = await createTempDir("scan-no-gitignore");
    try {
      await dir.write("only.ts", "");

      const files = await scanRepo({ cwd: dir.path });

      expect(files).toEqual(["only.ts"]);
    } finally {
      await dir.cleanup();
    }
  });
});
