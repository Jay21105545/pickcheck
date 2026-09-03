import { describe, expect, it } from "vitest";
import { detectStack } from "../../src/engine/detect.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("detectStack", () => {
  it("detects a Next.js app via package.json dependencies and a pnpm lockfile", async () => {
    const repo = await createTempDir("detect-next");
    try {
      await repo.write(
        "package.json",
        JSON.stringify({
          name: "my-next-app",
          scripts: { test: "vitest", lint: "eslint ." },
          dependencies: { next: "^15.0.0", react: "^19.0.0" },
        }),
      );
      await repo.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");

      const stack = await detectStack(repo.path);

      expect(stack.ecosystem).toBe("node");
      expect(stack.projectName).toBe("my-next-app");
      expect(stack.packageManager).toBe("pnpm");
      expect(stack.framework).toBe("next");
      expect(stack.installCmd).toBe("pnpm install");
      expect(stack.testCmd).toBe("pnpm test");
      expect(stack.lintCmd).toBe("pnpm run lint");
    } finally {
      await repo.cleanup();
    }
  });

  it("falls back to npm with placeholder commands when scripts/lockfiles are absent", async () => {
    const repo = await createTempDir("detect-bare-node");
    try {
      await repo.write("package.json", JSON.stringify({ name: "bare" }));

      const stack = await detectStack(repo.path);

      expect(stack.packageManager).toBe("npm");
      expect(stack.framework).toBe("generic");
      expect(stack.testCmd).toContain('no "test" script');
      expect(stack.lintCmd).toContain('no "lint" script');
    } finally {
      await repo.cleanup();
    }
  });

  it("detects Express via a routes/ directory as the API surface", async () => {
    const repo = await createTempDir("detect-express");
    try {
      await repo.write(
        "package.json",
        JSON.stringify({ name: "api", dependencies: { express: "^4.0.0" } }),
      );
      await repo.write("routes/users.js", "module.exports = () => {};\n");

      const stack = await detectStack(repo.path);

      expect(stack.framework).toBe("express");
      expect(stack.apiFiles).toEqual(["routes/users.js"]);
    } finally {
      await repo.cleanup();
    }
  });

  it("falls back to a marker file when no routes glob matches", async () => {
    const repo = await createTempDir("detect-express-marker");
    try {
      await repo.write(
        "package.json",
        JSON.stringify({ name: "api", dependencies: { express: "^4.0.0" } }),
      );
      await repo.write(
        "server.js",
        "const app = express();\napp.get('/', () => {});\n",
      );

      const stack = await detectStack(repo.path);

      expect(stack.apiFiles).toEqual(["server.js"]);
    } finally {
      await repo.cleanup();
    }
  });

  it("detects FastAPI from requirements.txt when there's no package.json", async () => {
    const repo = await createTempDir("detect-fastapi");
    try {
      await repo.write("requirements.txt", "fastapi==0.115.0\nuvicorn==0.30.0\n");

      const stack = await detectStack(repo.path);

      expect(stack.ecosystem).toBe("python");
      expect(stack.framework).toBe("fastapi");
      expect(stack.packageManager).toBeNull();
      expect(stack.installCmd).toBe("pip install -r requirements.txt");
    } finally {
      await repo.cleanup();
    }
  });

  it("returns an unknown ecosystem when neither manifest is present", async () => {
    const repo = await createTempDir("detect-unknown");
    try {
      await repo.write("README.md", "# nothing here\n");

      const stack = await detectStack(repo.path);

      expect(stack.ecosystem).toBe("unknown");
      expect(stack.apiFiles).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  it("finds root .env files", async () => {
    const repo = await createTempDir("detect-env");
    try {
      await repo.write("package.json", JSON.stringify({ name: "x" }));
      await repo.write(".env", "DATABASE_URL=postgres://localhost\n");

      const stack = await detectStack(repo.path);

      expect(stack.envFiles).toEqual([".env"]);
    } finally {
      await repo.cleanup();
    }
  });
});
