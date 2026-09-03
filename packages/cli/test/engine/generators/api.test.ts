import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  generateApiPrompt,
  NoApiSurfaceError,
} from "../../../src/engine/generators/api.js";
import { createTempDir } from "../../helpers/temp-dir.js";

describe("generateApiPrompt", () => {
  it("embeds every detected route's source into pickcheck-prompt.md", async () => {
    const repo = await createTempDir("gen-api");
    try {
      await repo.write(
        "package.json",
        JSON.stringify({ name: "demo", dependencies: { next: "^15.0.0" } }),
      );
      await repo.write(
        "app/api/users/route.ts",
        "export async function GET() {\n  return Response.json({ ok: true });\n}\n",
      );

      const result = await generateApiPrompt({ cwd: repo.path });

      expect(result.apiFiles).toEqual(["app/api/users/route.ts"]);
      expect(result.prompt).toContain("app/api/users/route.ts");
      expect(result.prompt).toContain("Response.json({ ok: true })");
      expect(result.prompt).toContain("1 file(s)");
      expect(result.prompt).toContain("demo");
      expect(result.prompt).toContain("next");

      const written = await readFile(result.outputPath, "utf-8");
      expect(written).toBe(result.prompt);
    } finally {
      await repo.cleanup();
    }
  });

  it("throws NoApiSurfaceError when no API surface is detected", async () => {
    const repo = await createTempDir("gen-api-none");
    try {
      await repo.write("package.json", JSON.stringify({ name: "demo" }));
      await repo.write(
        "app/page.tsx",
        "export default function Page() { return null; }\n",
      );

      await expect(generateApiPrompt({ cwd: repo.path })).rejects.toThrow(
        NoApiSurfaceError,
      );
    } finally {
      await repo.cleanup();
    }
  });
});
