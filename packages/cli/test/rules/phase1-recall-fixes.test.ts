import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Rule, ruleSchema } from "@pickcheck/rules/schema";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { scanRepo } from "../../src/engine/scan.js";
import { dispatchTier } from "../../src/engine/tiers/index.js";
import { createTempDir, type TempDir } from "../helpers/temp-dir.js";

/**
 * Regression suite for DECISIONS/0027 — the four shipped rules whose
 * implementations had drifted from what they claimed to detect.
 *
 * These load the REAL rule.yaml (not a hand-built rule object) and run it
 * against the REAL shape that exposed each gap in the corpus. The
 * fixtures/bad + fixtures/good harness only asserts "≥1 finding" and "0
 * findings" per rule, which can't distinguish *which* pattern fired — so a
 * silent regression in any single widened alternative would pass there.
 * Each case below pins one alternative on its own.
 */
const rulesRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../rules");

function loadRule(relativePath: string): Rule {
  const parsed = ruleSchema.safeParse(
    parseYaml(readFileSync(join(rulesRoot, relativePath, "rule.yaml"), "utf-8")),
  );
  if (!parsed.success) {
    throw new Error(
      `${relativePath}/rule.yaml failed validation: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

/** Runs `rule` over a temp repo built from `files`, returning matched "path:line" strings. */
async function findingsFor(
  rule: Rule,
  files: Record<string, string>,
): Promise<string[]> {
  let temp: TempDir | undefined;
  try {
    temp = await createTempDir("pickcheck-phase1");
    for (const [path, content] of Object.entries(files)) {
      await temp.write(path, content);
    }
    const scannedFiles = await scanRepo({ cwd: temp.path });
    const result = await dispatchTier(rule, { cwd: temp.path, scannedFiles });
    return result.findings.map((f) =>
      f.line === undefined ? f.file : `${f.file}:${f.line}`,
    );
  } finally {
    await temp?.cleanup();
  }
}

describe("ux/destructive-no-confirm — ORM and Server Action idioms", () => {
  const rule = loadRule("ui-ux/destructive-no-confirm");

  it("flags a Supabase terminal .delete() split across lines", async () => {
    const findings = await findingsFor(rule, {
      "src/Friends.tsx": [
        "export function RemoveFriend({ id }) {",
        "  async function handleRemove() {",
        "    await supabase",
        '      .from("friendships")',
        "      .delete()",
        '      .eq("id", id);',
        "  }",
        "  return <button onClick={handleRemove}>Remove</button>;",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual(["src/Friends.tsx:5"]);
  });

  it("does not flag argument-taking .delete(x) on built-in collections", async () => {
    const findings = await findingsFor(rule, {
      "src/Edits.tsx": [
        "export function applyEdits(params, ids, timeouts, id) {",
        '  params.delete("q");',
        "  ids.delete(id);",
        "  timeouts.delete(id);",
        "  return <span>{params.toString()}</span>;",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("flags a delete-named Server Action bound to a form", async () => {
    const findings = await findingsFor(rule, {
      "src/DangerZone.tsx": [
        '"use client";',
        "export function DangerZone({ deleteAction }) {",
        "  return (",
        "    <form action={deleteAction}>",
        '      <button type="submit">Delete account</button>',
        "    </form>",
        "  );",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual(["src/DangerZone.tsx:4"]);
  });

  it("does not flag a remove-named Server Action (cart line-item removal)", async () => {
    // vercel/commerce components/cart/delete-item-button.tsx:15 — the
    // calibrated false positive that kept `remove` out of the verb list.
    const findings = await findingsFor(rule, {
      "src/DeleteItemButton.tsx": [
        '"use client";',
        'import { removeItem } from "@/components/cart/actions";',
        "export function DeleteItemButton({ merchandiseId }) {",
        "  const [message, formAction] = useActionState(removeItem, null);",
        '  return <form action={formAction}><button type="submit">x</button></form>;',
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("still flags the original axios and fetch DELETE shapes", async () => {
    const findings = await findingsFor(rule, {
      "src/A.tsx": 'export const a = () => axios.delete("/items/" + id);',
      "src/B.tsx": 'export const b = () => fetch(url, { method: "DELETE" });',
    });

    expect(findings.sort()).toEqual(["src/A.tsx:1", "src/B.tsx:1"]);
  });

  it("stays silent when the file references a confirmation mechanism", async () => {
    const findings = await findingsFor(rule, {
      "src/Confirmed.tsx": [
        'import { AlertDialog } from "@/components/ui/alert-dialog";',
        "export function DeleteHabit({ id }) {",
        "  const onConfirm = async () => {",
        "    await supabase",
        '      .from("habits")',
        "      .delete()",
        '      .eq("id", id);',
        "  };",
        "  return <AlertDialog onConfirm={onConfirm} />;",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });
});

describe("disc/no-console-log — serverless function directories", () => {
  const rule = loadRule("discipline/no-console-log");

  it("does not flag console.log inside supabase/functions", async () => {
    const findings = await findingsFor(rule, {
      "package.json": "{}",
      "supabase/functions/geocode/index.ts": 'console.log("geocoding", address);',
    });

    expect(findings).toEqual([]);
  });

  it("does not flag console.log inside netlify function directories", async () => {
    const findings = await findingsFor(rule, {
      "package.json": "{}",
      "netlify/functions/hello.ts": 'console.log("hi");',
      "netlify/edge-functions/geo.ts": 'console.log("hi");',
    });

    expect(findings).toEqual([]);
  });

  it("still flags console.log in ordinary application source", async () => {
    const findings = await findingsFor(rule, {
      "package.json": "{}",
      "src/handler.ts": 'console.log("debugging");',
    });

    expect(findings).toEqual(["src/handler.ts:1"]);
  });

  it("still flags console.log in a src/functions helper directory", async () => {
    // Deliberately NOT excluded: a bare `functions/` is an app's own
    // helpers as often as a Cloud Functions root, so only
    // platform-named parents are carved out.
    const findings = await findingsFor(rule, {
      "package.json": "{}",
      "src/functions/format.ts": 'console.log("debugging");',
    });

    expect(findings).toEqual(["src/functions/format.ts:1"]);
  });
});

describe("sec/post-has-validation — serverless bodies and req.json()", () => {
  const rule = loadRule("security/post-has-validation");

  it("flags an unvalidated body in a supabase edge function", async () => {
    const findings = await findingsFor(rule, {
      "supabase/functions/chat/index.ts": [
        "Deno.serve(async (req) => {",
        "  const { messages } = await req.json();",
        "  return new Response(JSON.stringify(messages));",
        "});",
      ].join("\n"),
    });

    expect(findings).toEqual(["supabase/functions/chat/index.ts:2"]);
  });

  it("matches request.body, which the original alternation missed", async () => {
    const findings = await findingsFor(rule, {
      "app/api/orders/route.ts": "export const POST = (request) => save(request.body);",
    });

    expect(findings).toEqual(["app/api/orders/route.ts:1"]);
  });

  it("matches a receiver-prefixed body read (Hono/Elysia c.req.json())", async () => {
    const findings = await findingsFor(rule, {
      "api/chat.ts": "export const post = async (c) => save(await c.req.json());",
    });

    expect(findings).toEqual(["api/chat.ts:1"]);
  });

  it("never matches a response parse", async () => {
    const findings = await findingsFor(rule, {
      "app/api/proxy/route.ts": [
        "export async function POST() {",
        "  const res = await fetch(upstream);",
        "  const data = await res.json();",
        "  const other = await response.json();",
        "  return Response.json({ data, other });",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("stays silent when the edge function validates", async () => {
    const findings = await findingsFor(rule, {
      "supabase/functions/chat/index.ts": [
        'import { z } from "https://esm.sh/zod@3.23.8";',
        "const schema = z.object({ messages: z.array(z.string()) });",
        "Deno.serve(async (req) => {",
        "  const { messages } = schema.parse(await req.json());",
        "  return new Response(JSON.stringify(messages));",
        "});",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });
});

describe("docs/api-doc-exists — serverless functions are an API surface", () => {
  const rule = loadRule("docs/api-doc-exists");

  it("requires API docs for a repo whose only HTTP surface is edge functions", async () => {
    const findings = await findingsFor(rule, {
      "README.md": "# app",
      "supabase/functions/notify/index.ts": "Deno.serve(() => new Response('ok'));",
    });

    expect(findings).toEqual(["API.md"]);
  });

  it("is satisfied by an existing API.md", async () => {
    const findings = await findingsFor(rule, {
      "API.md": "# API\n\n## POST /functions/v1/notify\n",
      "supabase/functions/notify/index.ts": "Deno.serve(() => new Response('ok'));",
    });

    expect(findings).toEqual([]);
  });

  it("stays inapplicable for a repo with no HTTP surface at all", async () => {
    const findings = await findingsFor(rule, {
      "README.md": "# app",
      "src/index.ts": "export const x = 1;",
    });

    expect(findings).toEqual([]);
  });
});

describe("docs/env-example-exists — RULESET.md §6 key coverage", () => {
  const rule = loadRule("docs/env-example-exists");

  it("fires on undocumented keys even with no .env file present", async () => {
    // The whole point of the drift fix: the shipped v1 keyed off a `.env`
    // existing on disk, so a repo that reads env vars and ships neither
    // file scored clean.
    const findings = await findingsFor(rule, {
      "src/db.ts": "export const url = process.env.DATABASE_URL;",
      "src/auth.ts": "export const secret = process.env.AUTH_SECRET;",
    });

    expect(findings).toEqual([".env.example"]);
  });

  it("passes at exactly the 60% threshold boundary", async () => {
    const findings = await findingsFor(rule, {
      ".env.example": "A_KEY=\nB_KEY=\nC_KEY=\n",
      "src/index.ts": [
        "export const a = process.env.A_KEY;",
        "export const b = process.env.B_KEY;",
        "export const c = process.env.C_KEY;",
        "export const d = process.env.D_KEY;",
        "export const e = process.env.E_KEY;",
      ].join("\n"),
    });

    // 3 of 5 documented = 60%, which is >= the threshold.
    expect(findings).toEqual([]);
  });

  it("fires just below the threshold", async () => {
    const findings = await findingsFor(rule, {
      ".env.example": "A_KEY=\nB_KEY=\n",
      "src/index.ts": [
        "export const a = process.env.A_KEY;",
        "export const b = process.env.B_KEY;",
        "export const c = process.env.C_KEY;",
        "export const d = process.env.D_KEY;",
        "export const e = process.env.E_KEY;",
      ].join("\n"),
    });

    expect(findings).toEqual([".env.example"]);
  });

  it("names the missing keys in the fix prompt", async () => {
    let temp: TempDir | undefined;
    try {
      temp = await createTempDir("pickcheck-phase1");
      await temp.write(".env.example", "DATABASE_URL=\n");
      await temp.write(
        "src/index.ts",
        "export const a = process.env.DATABASE_URL;\nexport const b = process.env.STRIPE_SECRET_KEY;\n",
      );
      const scannedFiles = await scanRepo({ cwd: temp.path });
      const result = await dispatchTier(rule, { cwd: temp.path, scannedFiles });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.fixPrompt).toContain("STRIPE_SECRET_KEY");
      expect(result.findings[0]?.fixPrompt).toContain("50% documented");
    } finally {
      await temp?.cleanup();
    }
  });

  it("exempts a key whose absence the code handles", async () => {
    // steven-tey/precedent app/page.tsx:13 — the calibrated false positive.
    const findings = await findingsFor(rule, {
      ".env.example": "CLERK_SECRET_KEY=\n",
      "app/page.tsx": [
        "const res = await fetch(url, {",
        "  ...(process.env.GITHUB_OAUTH_TOKEN && {",
        '    headers: { Authorization: "Bearer " + process.env.GITHUB_OAUTH_TOKEN },',
        "  }),",
        "});",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("still requires a key the code asserts is present", async () => {
    // The assign-then-throw shape must stay required — it is the code
    // declaring the variable mandatory, the opposite of the guard above.
    const findings = await findingsFor(rule, {
      ".env.example": "OTHER_KEY=\n",
      "supabase/functions/chat/index.ts": [
        'const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");',
        "if (!LOVABLE_API_KEY) {",
        '  throw new Error("LOVABLE_API_KEY is not configured");',
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([".env.example"]);
  });

  it("ignores platform-injected values", async () => {
    const findings = await findingsFor(rule, {
      "src/index.ts": [
        'export const isProd = process.env.NODE_ENV === "production";',
        "export const url = process.env.VERCEL_PROJECT_PRODUCTION_URL;",
        'export const sb = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");',
      ].join("\n"),
    });

    // Every key ignored, so nothing is required and the rule is inapplicable.
    expect(findings).toEqual([]);
  });

  it("does not read env references out of comments", async () => {
    // pickcheck's own packages/rules/schema.ts documents the access
    // syntaxes in prose and self-audited as a finding before this.
    const findings = await findingsFor(rule, {
      "src/index.ts": [
        "// Extracts a key from `process.env.X` or `import.meta.env.Y`.",
        '/** Also handles `Deno.env.get("Z")`. */',
        "export const nothing = 1;",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("counts a #-commented key in .env.example as documented", async () => {
    const findings = await findingsFor(rule, {
      ".env.example":
        "DATABASE_URL=\n# SENTRY_DSN=https://example.ingest.sentry.io/1\n",
      "src/index.ts": [
        "export const a = process.env.DATABASE_URL;",
        "export const b = process.env.SENTRY_DSN;",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });
});
