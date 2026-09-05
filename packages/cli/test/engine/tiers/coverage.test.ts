import type { CoverageRule } from "@pickcheck/rules/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanRepo } from "../../../src/engine/scan.js";
import { runCoverageTier } from "../../../src/engine/tiers/coverage.js";
import { createTempDir, type TempDir } from "../../helpers/temp-dir.js";

function rule(overrides: Partial<CoverageRule["pattern"]> = {}): CoverageRule {
  return {
    id: "docs/env-example-exists",
    category: "docs",
    severity: "warn",
    title: "Env vars undocumented",
    files: ["**/*.{ts,tsx,js,jsx}"],
    message: "Undocumented environment variables.",
    weight: 2,
    tier: "coverage",
    pattern: {
      regex: "process\\.env\\.([A-Z][A-Z0-9_]*)",
      declaredIn: {
        files: [".env.example"],
        regex: "^\\s*([A-Z][A-Z0-9_]*)\\s*=",
        flags: "m",
      },
      threshold: 0.6,
      ignore: [],
      ...overrides,
    },
  };
}

let temp: TempDir;

beforeEach(async () => {
  temp = await createTempDir("pickcheck-coverage");
});

afterEach(async () => {
  await temp.cleanup();
});

async function run(r: CoverageRule) {
  const scannedFiles = await scanRepo({ cwd: temp.path });
  return runCoverageTier(r, { cwd: temp.path, scannedFiles });
}

describe("runCoverageTier", () => {
  it("is inapplicable when no source file matches", async () => {
    await temp.write("README.md", "# app");

    expect(await run(rule())).toEqual({ findings: [], warnings: [] });
  });

  it("is inapplicable when matched sources use no identifiers", async () => {
    await temp.write("src/index.ts", "export const x = 1;");

    expect(await run(rule())).toEqual({ findings: [], warnings: [] });
  });

  it("reports against the declaration file when it exists", async () => {
    await temp.write(".env.example", "A=\n");
    await temp.write(
      "src/index.ts",
      "export const a = process.env.A;\nexport const b = process.env.B;\nexport const c = process.env.C;\n",
    );

    const result = await run(rule());

    expect(result.warnings).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe(".env.example");
    expect(result.findings[0]?.line).toBeUndefined();
  });

  it("reports against the first expected path when no declaration file exists", async () => {
    await temp.write("src/index.ts", "export const a = process.env.A;");

    const result = await run(
      rule({
        declaredIn: {
          files: [".env.sample", ".env.example"],
          regex: "^\\s*([A-Z][A-Z0-9_]*)\\s*=",
          flags: "m",
        },
      }),
    );

    expect(result.findings.map((f) => f.file)).toEqual([".env.sample"]);
  });

  it("produces exactly one finding no matter how many identifiers are missing", async () => {
    await temp.write(
      "src/index.ts",
      "export const x = [process.env.A, process.env.B, process.env.C];",
    );

    const result = await run(rule());

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.fixPrompt).toContain("A, B, C");
  });

  it("unions identifiers across every matched source file", async () => {
    await temp.write(".env.example", "A=\nB=\n");
    await temp.write("src/a.ts", "export const a = process.env.A;");
    await temp.write("src/b.ts", "export const b = process.env.B;");
    await temp.write("src/c.ts", "export const c = process.env.C;");

    // 2 of 3 = 67%, above threshold.
    expect((await run(rule())).findings).toEqual([]);
  });

  it("unions declarations across every matched declaration file", async () => {
    await temp.write(".env.example", "A=\n");
    await temp.write(".env.sample", "B=\n");
    await temp.write(
      "src/index.ts",
      "export const x = [process.env.A, process.env.B];",
    );

    const result = await run(
      rule({
        declaredIn: {
          files: [".env.example", ".env.sample"],
          regex: "^\\s*([A-Z][A-Z0-9_]*)\\s*=",
          flags: "m",
        },
      }),
    );

    expect(result.findings).toEqual([]);
  });

  it("takes the first participating capture group across alternation branches", async () => {
    await temp.write(".env.example", "FROM_DOT=\nFROM_BRACKET=\nFROM_DENO=\n");
    await temp.write(
      "src/index.ts",
      [
        "export const a = process.env.FROM_DOT;",
        'export const b = process.env["FROM_BRACKET"];',
        'export const c = Deno.env.get("FROM_DENO");',
      ].join("\n"),
    );

    const result = await run(
      rule({
        regex:
          "process\\.env\\.([A-Z][A-Z0-9_]*)|process\\.env\\[\\s*[\"']([A-Z][A-Z0-9_]*)[\"']\\s*\\]|Deno\\.env\\.get\\(\\s*[\"']([A-Z][A-Z0-9_]*)[\"']\\s*\\)",
      }),
    );

    expect(result.findings).toEqual([]);
  });

  it("drops identifiers matched by optionalRegex from the denominator", async () => {
    await temp.write("src/index.ts", "export const a = process.env.OPTIONAL_KEY && 1;");

    const result = await run(
      rule({ optionalRegex: "process\\.env\\.([A-Z][A-Z0-9_]*)\\s*&&" }),
    );

    // The only identifier is optional, so nothing is required.
    expect(result.findings).toEqual([]);
  });

  it("treats optionality as repo-wide, not per-occurrence", async () => {
    await temp.write("src/guard.ts", "export const on = process.env.FLAG && true;");
    await temp.write("src/use.ts", "export const v = process.env.FLAG;");

    const result = await run(
      rule({ optionalRegex: "process\\.env\\.([A-Z][A-Z0-9_]*)\\s*&&" }),
    );

    expect(result.findings).toEqual([]);
  });

  it("honours exact and prefix entries in ignore", async () => {
    await temp.write(
      "src/index.ts",
      "export const x = [process.env.NODE_ENV, process.env.VERCEL_URL, process.env.VERCEL_ENV];",
    );

    const result = await run(rule({ ignore: ["NODE_ENV", "VERCEL*"] }));

    expect(result.findings).toEqual([]);
  });

  it("does not extract identifiers out of comments", async () => {
    await temp.write(
      "src/index.ts",
      [
        "// reads process.env.COMMENTED",
        "/* and process.env.BLOCKED */",
        "export const x = 1;",
      ].join("\n"),
    );

    expect((await run(rule())).findings).toEqual([]);
  });

  it("still reads declarations out of #-commented lines", async () => {
    await temp.write(".env.example", "# OPTIONAL_DSN=https://example.test\n");
    await temp.write("src/index.ts", "export const d = process.env.OPTIONAL_DSN;");

    const result = await run(
      rule({
        declaredIn: {
          files: [".env.example"],
          regex: "^\\s*#?\\s*([A-Z][A-Z0-9_]*)\\s*=",
          flags: "m",
        },
      }),
    );

    expect(result.findings).toEqual([]);
  });

  it("treats the threshold as inclusive", async () => {
    await temp.write(".env.example", "A=\nB=\nC=\n");
    await temp.write(
      "src/index.ts",
      "export const x = [process.env.A, process.env.B, process.env.C, process.env.D, process.env.E];",
    );

    // Exactly 3/5 = 0.6.
    expect((await run(rule({ threshold: 0.6 }))).findings).toEqual([]);
    expect((await run(rule({ threshold: 0.61 }))).findings).toHaveLength(1);
  });
});
