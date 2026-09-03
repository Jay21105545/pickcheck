import type { ManifestRule } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { runManifestTier, stripComments } from "../../../src/engine/tiers/manifest.js";
import { createTempDir } from "../../helpers/temp-dir.js";

function rule(overrides: Partial<ManifestRule> = {}): ManifestRule {
  return {
    id: "sec/no-hallucinated-imports",
    category: "security",
    severity: "error",
    title: "Import of an undeclared package",
    files: ["**/*.ts"],
    message: "This package isn't declared in package.json.",
    weight: 4,
    tier: "manifest",
    pattern: {
      mode: "hallucinated-import",
      regex:
        "(?:\\bfrom\\s+|\\brequire\\(\\s*|\\bimport\\(\\s*|\\bimport\\s+)['\"]([^'\"]+)['\"]",
      manifestFile: "package.json",
      dependencyFields: ["dependencies", "devDependencies"],
    },
    ...overrides,
  };
}

describe("runManifestTier", () => {
  it("flags a bare specifier absent from package.json", async () => {
    const dir = await createTempDir("manifest-hallucinated");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write("src/a.ts", "import { thing } from 'left-pad-plus-plus';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.warnings).toEqual([]);
      expect(result.findings).toEqual([
        expect.objectContaining({ file: "src/a.ts", line: 1 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not flag a declared dependency", async () => {
    const dir = await createTempDir("manifest-declared");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write("src/a.ts", "import { debounce } from 'lodash';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves a subpath import to its package name", async () => {
    const dir = await createTempDir("manifest-subpath");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write("src/a.ts", "import debounce from 'lodash/debounce';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves a scoped subpath import to its scope/name package", async () => {
    const dir = await createTempDir("manifest-scoped-subpath");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { "@pickcheck/rules": "workspace:^" } }),
      );
      await dir.write(
        "src/a.ts",
        "import { ruleSchema } from '@pickcheck/rules/schema';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("exempts node: builtins, including builtin subpaths", async () => {
    const dir = await createTempDir("manifest-builtins");
    try {
      await dir.write("package.json", JSON.stringify({ dependencies: {} }));
      await dir.write(
        "src/a.ts",
        "import fs from 'node:fs';\nimport { join } from 'node:path';\nimport { readFile } from 'node:fs/promises';\nimport path from 'path';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("exempts relative imports and @/-style path aliases", async () => {
    const dir = await createTempDir("manifest-relative");
    try {
      await dir.write("package.json", JSON.stringify({ dependencies: {} }));
      await dir.write(
        "src/a.ts",
        "import { helper } from './helper';\nimport { Button } from '@/components/Button';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("skips a file (never crashes) when no ancestor manifest exists up to the scanned root", async () => {
    const dir = await createTempDir("manifest-missing");
    try {
      await dir.write("src/a.ts", "import { thing } from 'nonexistent-package';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["src/a.ts"],
      });

      expect(result.findings).toEqual([]);
      expect(result.warnings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves a package-level dependency the workspace root doesn't declare — monorepo-safe", async () => {
    const dir = await createTempDir("manifest-monorepo-nearest");
    try {
      // A workspace root manifest that does NOT declare "left-pad" —
      // only the nested package's own package.json does. Reading only
      // the root would wrongly flag every file in packages/widgets.
      await dir.write(
        "package.json",
        JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      );
      await dir.write(
        "packages/widgets/package.json",
        JSON.stringify({ dependencies: { "left-pad": "^1.0.0" } }),
      );
      await dir.write(
        "packages/widgets/src/pad.ts",
        "import leftPad from 'left-pad';\nimport { thing } from 'not-declared-anywhere';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: [
          "package.json",
          "packages/widgets/package.json",
          "packages/widgets/src/pad.ts",
        ],
      });

      expect(result.findings).toEqual([
        expect.objectContaining({ file: "packages/widgets/src/pad.ts", line: 2 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("also resolves a devDependency declared only at the workspace root — tooling-config-safe", async () => {
    const dir = await createTempDir("manifest-monorepo-root-dep");
    try {
      // packages/cli's own package.json doesn't list "tsup" — only the
      // workspace root does, exactly like this repo's real
      // packages/cli/tsup.config.ts importing the root's "tsup"
      // devDependency. "Nearest ancestor wins" would stop at
      // packages/cli/package.json and miss it; the root must still be
      // unioned in.
      await dir.write(
        "package.json",
        JSON.stringify({ devDependencies: { tsup: "^8.0.0" } }),
      );
      await dir.write(
        "packages/cli/package.json",
        JSON.stringify({ dependencies: { commander: "^15.0.0" } }),
      );
      await dir.write(
        "packages/cli/tsup.config.ts",
        "import { defineConfig } from 'tsup';\nexport default defineConfig({});\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: [
          "package.json",
          "packages/cli/package.json",
          "packages/cli/tsup.config.ts",
        ],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("exempts a bare specifier resolved via tsconfig's baseUrl (DECISIONS/0015)", async () => {
    const dir = await createTempDir("manifest-baseurl");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write(
        "tsconfig.json",
        JSON.stringify({ compilerOptions: { baseUrl: "." } }),
      );
      await dir.write("types/index.d.ts", "export interface Thing {}\n");
      await dir.write("config/site.ts", "export const site = { name: 'demo' };\n");
      await dir.write(
        "src/a.ts",
        "import type { Thing } from 'types';\nimport { site } from 'config/site';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: [
          "package.json",
          "tsconfig.json",
          "types/index.d.ts",
          "config/site.ts",
          "src/a.ts",
        ],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("falls back to resolving bare specifiers against the repo root when no tsconfig exists", async () => {
    const dir = await createTempDir("manifest-rootfallback");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write("lib/shopify.ts", "export function getProducts() {}\n");
      await dir.write("app/page.tsx", "import { getProducts } from 'lib/shopify';\n");

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "lib/shopify.ts", "app/page.tsx"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("still flags a bare specifier that resolves neither to a dependency nor a local file, even with baseUrl configured", async () => {
    const dir = await createTempDir("manifest-baseurl-miss");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write(
        "tsconfig.json",
        JSON.stringify({ compilerOptions: { baseUrl: "." } }),
      );
      await dir.write(
        "src/a.ts",
        "import { helper } from 'totally-not-a-real-helper';\n",
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "tsconfig.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([
        expect.objectContaining({ file: "src/a.ts", line: 1 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("exempts URL-scheme and npm:/jsr: specifiers — Deno/edge-function imports (DECISIONS/0015)", async () => {
    const dir = await createTempDir("manifest-url-imports");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write(
        "supabase/functions/hello/index.ts",
        [
          "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';",
          "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';",
          "import chalk from 'npm:chalk@5';",
          "import data from 'jsr:@std/json';",
          "serve(() => new Response('ok'));",
          "",
        ].join("\n"),
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "supabase/functions/hello/index.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not read a hallucinated-looking specifier out of a line comment", async () => {
    const dir = await createTempDir("manifest-line-comment");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write(
        "src/a.ts",
        [
          '// Clear the flag when switching away from "Other"',
          "export const OTHER = 'Other';",
          "",
        ].join("\n"),
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not read a hallucinated-looking specifier out of a JSDoc block-comment type annotation", async () => {
    const dir = await createTempDir("manifest-block-comment");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { postcss: "^8.0.0" } }),
      );
      await dir.write(
        "postcss.config.mjs",
        [
          "/** @type {import('postcss-load-config').Config} */",
          "export default {",
          "  plugins: {},",
          "};",
          "",
        ].join("\n"),
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "postcss.config.mjs"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("still flags a real hallucinated import on the line right after a comment mentioning an unrelated package name", async () => {
    const dir = await createTempDir("manifest-comment-adjacent");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
      );
      await dir.write(
        "src/a.ts",
        [
          '// This comment mentions "fake-package-name" but is just a comment',
          "import { thing } from 'another-fake-package';",
          "",
        ].join("\n"),
      );

      const result = await runManifestTier(rule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/a.ts"],
      });

      expect(result.findings).toEqual([
        expect.objectContaining({ file: "src/a.ts", line: 2 }),
      ]);
    } finally {
      await dir.cleanup();
    }
  });
});

describe("stripComments", () => {
  it("blanks out a line comment but preserves the newline and overall length", () => {
    const input = "const a = 1; // trailing comment\nconst b = 2;";
    const result = stripComments(input);
    expect(result).toHaveLength(input.length);
    expect(result.split("\n")).toHaveLength(2);
    expect(result).not.toContain("trailing");
    expect(result.startsWith("const a = 1;")).toBe(true);
    expect(result.endsWith("const b = 2;")).toBe(true);
  });

  it("blanks out a block comment across multiple lines, preserving line count", () => {
    const input = "before /* line one\nline two */ after";
    const result = stripComments(input);
    expect(result.split("\n")).toHaveLength(2);
    expect(result).not.toContain("line one");
    expect(result).not.toContain("line two");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });

  it("does not treat // inside a string literal as a comment", () => {
    const input = 'import { serve } from "https://deno.land/std/http/server.ts";';
    expect(stripComments(input)).toBe(input);
  });

  it("does not treat a quote inside a comment as opening a string", () => {
    const input = '// switching away from "Other"\nconst x = 1;';
    const result = stripComments(input);
    expect(result.split("\n")[1]).toBe("const x = 1;");
  });
});

function cardInputRule(overrides: Partial<ManifestRule> = {}): ManifestRule {
  return {
    id: "sec/raw-card-input-no-payment-sdk",
    category: "security",
    severity: "error",
    title: "Raw card input field with no payment SDK",
    files: ["**/*.tsx"],
    message: "Raw card field with no payment SDK declared.",
    weight: 4,
    tier: "manifest",
    pattern: {
      mode: "requires-dependency",
      regex:
        "(?:name|id|htmlFor)\\s*=\\s*[\"'](?:cardNumber|card_number|cvv|cvc|expiry|expiration)[\"']",
      flags: "i",
      manifestFile: "package.json",
      dependencyFields: ["dependencies", "devDependencies"],
      requiresAnyOf: [
        "stripe",
        "@stripe/*",
        "braintree",
        "square",
        "@paypal/*",
        "adyen",
        "razorpay",
      ],
    },
    ...overrides,
  };
}

describe("runManifestTier — requires-dependency mode (DECISIONS/0018)", () => {
  it("flags a raw card field when no payment SDK is declared", async () => {
    const dir = await createTempDir("manifest-card-bad");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      );
      await dir.write(
        "src/Checkout.tsx",
        '<Input id="cardNumber" name="cardNumber" />\n',
      );

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/Checkout.tsx"],
      });

      expect(result.findings).toHaveLength(2); // id= and name= both match
      expect(result.findings[0]).toMatchObject({ file: "src/Checkout.tsx", line: 1 });
    } finally {
      await dir.cleanup();
    }
  });

  it("does not flag a raw card field when the exact payment SDK is declared", async () => {
    const dir = await createTempDir("manifest-card-exact-sdk");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { stripe: "^18.0.0" } }),
      );
      await dir.write("src/Checkout.tsx", '<Input id="cardNumber" />\n');

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/Checkout.tsx"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves a scope wildcard — @stripe/* matches @stripe/react-stripe-js", async () => {
    const dir = await createTempDir("manifest-card-scope-sdk");
    try {
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { "@stripe/react-stripe-js": "^2.0.0" } }),
      );
      await dir.write("src/Checkout.tsx", '<Label htmlFor="cardNumber">Card</Label>\n');

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/Checkout.tsx"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not match a scope wildcard against an unrelated package under a similarly-prefixed name", async () => {
    const dir = await createTempDir("manifest-card-scope-miss");
    try {
      // "@stripeadjacent/tools" must not satisfy "@stripe/*" — the scope
      // check requires the declared name to start with "@stripe/", not
      // merely with the substring "@stripe".
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { "@stripeadjacent/tools": "^1.0.0" } }),
      );
      await dir.write("src/Checkout.tsx", '<Input name="cvc" />\n');

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/Checkout.tsx"],
      });

      expect(result.findings).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not flag an unrelated field name", async () => {
    const dir = await createTempDir("manifest-card-unrelated");
    try {
      await dir.write("package.json", JSON.stringify({ dependencies: {} }));
      await dir.write("src/Checkout.tsx", '<Input id="email" name="email" />\n');

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/Checkout.tsx"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("does not flag a field name that merely contains a card token as a substring", async () => {
    const dir = await createTempDir("manifest-card-substring");
    try {
      await dir.write("package.json", JSON.stringify({ dependencies: {} }));
      await dir.write("src/Checkout.tsx", '<Input id="cardNumberDisplay" />\n');

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: ["package.json", "src/Checkout.tsx"],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("still flags a raw card field when there is no package.json at all — absence of a manifest is itself evidence", async () => {
    const dir = await createTempDir("manifest-card-no-manifest");
    try {
      await dir.write("src/Checkout.tsx", '<Input id="cvv" />\n');

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: ["src/Checkout.tsx"],
      });

      expect(result.findings).toHaveLength(1);
      expect(result.warnings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });

  it("resolves declared dependencies via the same ancestor-union walk as hallucinated-import", async () => {
    const dir = await createTempDir("manifest-card-monorepo");
    try {
      // Stripe declared only at the workspace root — must still be found.
      await dir.write(
        "package.json",
        JSON.stringify({ dependencies: { stripe: "^18.0.0" } }),
      );
      await dir.write(
        "packages/web/package.json",
        JSON.stringify({ dependencies: {} }),
      );
      await dir.write("packages/web/src/Checkout.tsx", '<Input id="cardNumber" />\n');

      const result = await runManifestTier(cardInputRule(), {
        cwd: dir.path,
        scannedFiles: [
          "package.json",
          "packages/web/package.json",
          "packages/web/src/Checkout.tsx",
        ],
      });

      expect(result.findings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });
});
