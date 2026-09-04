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

  it("includes dotfiles like .env, but never .gitignore itself", async () => {
    const dir = await createTempDir("scan-dotfiles");
    try {
      await dir.write(".gitignore", "dist/\n");
      await dir.write(".env", "SECRET=1\n");
      await dir.write("src/index.ts", "");

      const files = await scanRepo({ cwd: dir.path });

      expect(files).toEqual([".env", "src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("still honors .gitignore rules that target a dotfile", async () => {
    const dir = await createTempDir("scan-gitignore-dotfile");
    try {
      await dir.write(".gitignore", ".env\n");
      await dir.write(".env", "SECRET=1\n");
      await dir.write("src/index.ts", "");

      const files = await scanRepo({ cwd: dir.path });

      expect(files).toEqual(["src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });
});

/**
 * Build output must never be audited — findings from a webpack chunk are
 * noise nobody can act on. Each case here is one of the three ways a real
 * Next.js app leaked ~45 of 49 findings out of .next/ (DECISIONS/0023).
 */
describe("scanRepo: generated output is ignored by default", () => {
  const GENERATED_DIRS = [
    ".next",
    "dist",
    "build",
    "out",
    ".output",
    ".svelte-kit",
    ".nuxt",
    "coverage",
    ".turbo",
    ".vercel",
    "__pycache__",
    "target",
  ];

  for (const dirName of GENERATED_DIRS) {
    it(`ignores ${dirName}/ with no .gitignore present at all`, async () => {
      const dir = await createTempDir(`scan-default-${dirName.replace(".", "")}`);
      try {
        await dir.write(`${dirName}/chunk.js`, "console.log(1)\n");
        await dir.write("src/index.ts", "export const a = 1;\n");

        expect(await scanRepo({ cwd: dir.path })).toEqual(["src/index.ts"]);
      } finally {
        await dir.cleanup();
      }
    });
  }

  it("ignores pickcheck's own .pickcheck/ output", async () => {
    // report.html is generated markup with inline JS that trips our own
    // rules, and history.json is state — auditing either would mean a
    // repo's score changing simply because it was audited before.
    const dir = await createTempDir("scan-default-pickcheck-dir");
    try {
      await dir.write(".pickcheck/report.html", "<script>console.log(1)</script>\n");
      await dir.write(".pickcheck/history.json", '[{"composite":100}]\n');
      await dir.write("src/index.ts", "export const a = 1;\n");

      expect(await scanRepo({ cwd: dir.path })).toEqual(["src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("ignores minified and bundle files by name", async () => {
    const dir = await createTempDir("scan-default-minified");
    try {
      await dir.write("public/jquery.min.js", "x\n");
      await dir.write("public/styles.min.css", "a{}\n");
      await dir.write("public/app.bundle.js", "y\n");
      await dir.write("src/index.ts", "export const a = 1;\n");

      expect(await scanRepo({ cwd: dir.path })).toEqual(["src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("ignores generated dirs nested anywhere, not just at the root", async () => {
    // The monorepo case: a root .gitignore's `/.next/` is anchored to the
    // root and never matches apps/web/.next/, and pickcheck only reads the
    // root .gitignore, so apps/web/.gitignore is invisible to it.
    const dir = await createTempDir("scan-default-nested");
    try {
      await dir.write(".gitignore", "/node_modules\n/.next/\n");
      await dir.write("apps/web/.gitignore", "/.next/\n");
      await dir.write("apps/web/.next/static/chunks/polyfills.js", "console.log(1)\n");
      await dir.write("apps/web/app/page.tsx", "export default function P() {}\n");

      expect(await scanRepo({ cwd: dir.path })).toEqual(["apps/web/app/page.tsx"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("lets .pickcheckignore re-include a default-ignored directory", async () => {
    const dir = await createTempDir("scan-default-override");
    try {
      await dir.write(".pickcheckignore", "!dist/\n");
      await dir.write("dist/kept.ts", "export const a = 1;\n");
      await dir.write("src/index.ts", "export const b = 2;\n");

      expect(await scanRepo({ cwd: dir.path })).toEqual([
        "dist/kept.ts",
        "src/index.ts",
      ]);
    } finally {
      await dir.cleanup();
    }
  });
});

describe("scanRepo: generated output is ignored by content", () => {
  it("drops files with a minified-length line", async () => {
    const dir = await createTempDir("scan-content-minified");
    try {
      // No .min.js name and not in a known build dir — only the content
      // gives it away, which is the point: this catches bundlers whose
      // output directory we haven't enumerated.
      await dir.write("vendor/framework.js", `${"var a=1;".repeat(400)}\n`);
      await dir.write("src/index.ts", "export const a = 1;\n");

      expect(await scanRepo({ cwd: dir.path })).toEqual(["src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("drops files carrying a sourceMappingURL comment", async () => {
    const dir = await createTempDir("scan-content-sourcemap");
    try {
      await dir.write("vendor/app.js", "var x = 1;\n//# sourceMappingURL=app.js.map\n");
      await dir.write("vendor/app.css", "a{}\n/*# sourceMappingURL=app.css.map */\n");
      await dir.write("src/index.ts", "export const a = 1;\n");

      expect(await scanRepo({ cwd: dir.path })).toEqual(["src/index.ts"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("keeps hand-written source containing one very long line", async () => {
    // The exact regression a max-line-length heuristic caused: taxonomy's
    // app/api/og/route.tsx is a 148-line hand-written route whose inline
    // SVG logo is a single 1,664-char line. Dropping it silently hid two
    // real qual/fetch-has-error-handling findings (DECISIONS/0023).
    const dir = await createTempDir("scan-content-false-positive");
    try {
      const svgPath = "M127.008 39.792c-.38 0-.703-.131-.973-.394".repeat(40);
      const realSource = [
        "export function Logo() {",
        "  return (",
        "    <svg>",
        `      <path d="${svgPath}" />`,
        "    </svg>",
        "  );",
        "}",
        ...Array.from({ length: 140 }, (_, i) => `// ordinary line ${i}`),
      ].join("\n");

      await dir.write("src/logo.tsx", `${realSource}\n`);
      await dir.write("src/index.ts", "export const a = 1;\n");

      const files = await scanRepo({ cwd: dir.path });

      expect(svgPath.length).toBeGreaterThan(1000); // the line really is huge
      expect(files).toEqual(["src/index.ts", "src/logo.tsx"]);
    } finally {
      await dir.cleanup();
    }
  });

  it("only content-sniffs code files, leaving long lines in docs and data alone", async () => {
    const dir = await createTempDir("scan-content-non-code");
    try {
      await dir.write("README.md", `See ${"a".repeat(1500)}\n`);
      await dir.write("data.json", `{"k":"${"v".repeat(1500)}"}\n`);
      await dir.write("src/index.ts", "export const a = 1;\n");

      expect(await scanRepo({ cwd: dir.path })).toEqual([
        "README.md",
        "data.json",
        "src/index.ts",
      ]);
    } finally {
      await dir.cleanup();
    }
  });
});
