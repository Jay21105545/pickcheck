import type { CapabilityRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runCapabilityTier } from "../../../src/engine/tiers/capability.js";
import { createTempDir } from "../../helpers/temp-dir.js";

/** The shipped qual/no-typecheck-anywhere shape, so these test the rule as written. */
function rule(overrides: Partial<CapabilityRule> = {}): CapabilityRule {
  return {
    id: "qual/no-typecheck-anywhere",
    category: "quality",
    severity: "warn",
    title: "Nothing type-checks this project",
    files: ["**/*.{ts,tsx}"],
    message: "Nothing runs the TypeScript compiler.",
    weight: 3,
    tier: "capability",
    pattern: {
      reportAt: "package.json",
      providedBy: [
        {
          label: "a typecheck script",
          source: "package-scripts",
          regex: "\\btsc\\b(?![-\\w])|\\bvue-tsc\\b|\\btype-?check\\b",
          flags: "i",
        },
        {
          label: "a CI job that runs tsc",
          source: "files",
          files: [".github/workflows/*.{yml,yaml}"],
          regex: "\\btsc\\b(?![-\\w])|\\bvue-tsc\\b|\\btype-?check\\b",
          flags: "i",
        },
        {
          label: "a Next.js build",
          source: "files",
          files: ["next.config.{js,mjs,cjs,ts}"],
          revokedBy: "ignoreBuildErrors\\s*:\\s*true",
        },
      ],
    },
    ...overrides,
  } as CapabilityRule;
}

describe("runCapabilityTier", () => {
  it("flags a TS project where no provider establishes the capability", async () => {
    const dir = await createTempDir("capability-none");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "vite build", lint: "eslint ." } }),
      );
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.warnings).toEqual([]);
      expect(result.findings).toEqual([
        expect.objectContaining({
          file: "package.json",
          ruleId: "qual/no-typecheck-anywhere",
        }),
      ]);
      // The fix prompt names what was looked for, so the finding is
      // actionable without reading the rule.
      expect(result.findings[0]?.fixPrompt).toContain("a typecheck script");
    } finally {
      await dir.cleanup();
    }
  });

  it("is satisfied by a script matched on its name", async () => {
    const dir = await createTempDir("capability-script-name");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { typecheck: "tsc --noEmit" } }),
      );
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("is satisfied by tsc inside a differently-named script (the rowy shape)", async () => {
    const dir = await createTempDir("capability-script-body");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "tsc && vite build" } }),
      );
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not accept a dependency named like the pattern as a provider", async () => {
    const dir = await createTempDir("capability-dep-not-script");
    try {
      // `vue-tsc` is installed but nothing runs it. Matching the raw
      // package.json rather than its `scripts` would call this checked.
      await dir.write(
        "package.json",
        JSON.stringify({
          scripts: { build: "vite build" },
          devDependencies: { "vue-tsc": "^2.0.0" },
        }),
      );
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });

  it("is satisfied by a CI job that type-checks", async () => {
    const dir = await createTempDir("capability-ci");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "vite build" } }),
      );
      await dir.write(
        ".github/workflows/ci.yml",
        "jobs:\n  check:\n    steps:\n      - run: npx tsc --noEmit\n",
      );
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", ".github/workflows/ci.yml", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("credits a Next.js build with no explicit typecheck script", async () => {
    const dir = await createTempDir("capability-next");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "next build" } }),
      );
      await dir.write("next.config.mjs", "export default { reactStrictMode: true };\n");
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "next.config.mjs", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("revokes the Next.js provider when ignoreBuildErrors switches it off", async () => {
    const dir = await createTempDir("capability-next-revoked");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "next build" } }),
      );
      await dir.write(
        "next.config.mjs",
        "export default {\n  typescript: { ignoreBuildErrors: true },\n};\n",
      );
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "next.config.mjs", "src/a.ts"],
      });

      expect(result.findings).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not apply to a repo with no TypeScript source", async () => {
    const dir = await createTempDir("capability-not-applicable");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ scripts: { build: "vite build" } }),
      );
      await dir.write("src/a.js", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.js"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("treats `tsconfig` and `tsc-alias` as not type-checking", async () => {
    const dir = await createTempDir("capability-near-miss");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({
          scripts: { build: "tsc-alias -p tsconfig.build.json && vite build" },
        }),
      );
      await dir.write("src/a.ts", "export const a = 1;\n");

      const result = await runCapabilityTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });
});
