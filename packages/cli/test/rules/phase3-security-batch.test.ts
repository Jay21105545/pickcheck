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
 * Regression suite for DECISIONS/0033 — the security batch.
 *
 * Same contract as phase1-recall-fixes.test.ts and
 * phase2-backend-coverage.test.ts: load the REAL rule.yaml and run it
 * against the REAL shapes that were hand-classified in the corpus. The
 * fixtures/bad + fixtures/good harness only asserts "≥1 finding" and "0
 * findings" per rule, so it cannot pin *which* branch fired or which
 * exclusion did the excluding — and for these four rules the branch
 * boundaries are the whole calibration.
 *
 * Every JWT below is synthetic: a fake project ref and an all-zero
 * signature. None of them authenticates anything.
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
    temp = await createTempDir("pickcheck-phase3");
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

const JWT_HEADER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
const JWT_SIGNATURE = "0".repeat(43);

/**
 * Builds a synthetic Supabase key. `ref` length is the point of the
 * parameter: it shifts `"role"`'s byte offset, and therefore which of the
 * three base64 alignments the marker lands on.
 */
function supabaseKey(role: "anon" | "service_role", ref: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      iss: "supabase",
      ref,
      role,
      iat: 1_700_000_000,
      exp: 2_000_000_000,
    }),
  ).toString("base64url");
  return `${JWT_HEADER}.${payload}.${JWT_SIGNATURE}`;
}

/** A JWT from an issuer that is not Supabase. */
function foreignJwt(): string {
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://example.eu.auth0.com/",
      sub: "auth0|000000000000000000000000",
      aud: "example-api",
      iat: 1_700_000_000,
      exp: 2_000_000_000,
    }),
  ).toString("base64url");
  return `${JWT_HEADER}.${payload}.${JWT_SIGNATURE}`;
}

describe("sec/hardcoded-service-role-key", () => {
  const rule = loadRule("security/hardcoded-service-role-key");

  it("identifies a service-role key by role, without decoding it", async () => {
    // newattendanceapp/scripts/list-tables.ts, same shape.
    const findings = await findingsFor(rule, {
      "scripts/list-tables.ts": [
        'import { createClient } from "@supabase/supabase-js"',
        "",
        `const key = "${supabaseKey("service_role", "examplerefabcdefghij")}"`,
      ].join("\n"),
    });

    expect(findings).toEqual(["scripts/list-tables.ts:3"]);
  });

  /**
   * The three base64 alignments are the crux of the rule. A project ref of
   * length 19, 20 or 21 puts `"role"` at a different offset mod 3, so a
   * single literal would catch only one of them. This is the test that
   * fails if someone "simplifies" the alternation down to one branch, and
   * the one that would catch Supabase reordering its JWT claims.
   */
  it.each([16, 17, 18, 19, 20, 21, 22, 23, 24])(
    "matches a service-role key at every alignment (ref length %i)",
    async (refLength) => {
      const ref = "r".repeat(refLength);
      const findings = await findingsFor(rule, {
        "lib/admin.ts": `export const key = "${supabaseKey("service_role", ref)}";`,
      });

      expect(findings).toEqual(["lib/admin.ts:1"]);
    },
  );

  it.each([16, 19, 20, 21, 24])(
    "never matches the anon key, at any alignment (ref length %i)",
    async (refLength) => {
      const ref = "r".repeat(refLength);
      const findings = await findingsFor(rule, {
        "lib/client.ts": `export const key = "${supabaseKey("anon", ref)}";`,
      });

      expect(findings).toEqual([]);
    },
  );

  it("flags a service-role key read from a client-exposed env prefix", async () => {
    // newattendanceapp/scripts/force-checkout-failed-users.js, same shape:
    // no key literal anywhere, only the name.
    const findings = await findingsFor(rule, {
      "scripts/force-checkout.js": [
        "const key =",
        "  process.env.SUPABASE_SERVICE_ROLE_KEY ||",
        "  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
      ].join("\n"),
    });

    expect(findings).toEqual(["scripts/force-checkout.js:3"]);
  });

  it("leaves a server-only env name alone", async () => {
    const findings = await findingsFor(rule, {
      "lib/admin.ts": "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    });

    expect(findings).toEqual([]);
  });

  /**
   * Deliberately NOT exempt via excludePackageScriptTargets (ADR 0017). A
   * one-off developer script is exactly where this key gets pasted, and a
   * committed credential is committed whether or not `npm run` can reach
   * the file it sits in.
   */
  it("still flags a key inside a package.json script target", async () => {
    const findings = await findingsFor(rule, {
      "package.json": JSON.stringify({
        name: "app",
        scripts: { "db:check": "npx tsx scripts/check.ts" },
      }),
      "scripts/check.ts": `const key = "${supabaseKey("service_role", "examplerefabcdefghij")}";`,
    });

    expect(findings).toEqual(["scripts/check.ts:1"]);
  });
});

describe("sec/no-secrets-in-code", () => {
  const rule = loadRule("security/no-secrets-in-code");

  /**
   * The recall gap ADR 0033 closed: argument two has no name to anchor on,
   * so before the JWT branch existed this produced nothing.
   */
  it("catches a JWT passed positionally, with no variable name", async () => {
    const findings = await findingsFor(rule, {
      "lib/api.ts": `export const api = createClient("https://api.example.com", "${foreignJwt()}");`,
    });

    expect(findings).toEqual(["lib/api.ts:1"]);
  });

  it.each(["anon", "service_role"] as const)(
    "leaves the Supabase %s key to the rules that own it",
    async (role) => {
      const findings = await findingsFor(rule, {
        "lib/client.ts": `export const key = "${supabaseKey(role, "examplerefabcdefghij")}";`,
      });

      expect(findings).toEqual([]);
    },
  );

  it("still catches every shape it caught before the JWT branch", async () => {
    const findings = await findingsFor(rule, {
      "a.ts": 'export const k = "sk-1234567890abcdefghijklmnop";',
      "b.ts": 'export const k = "AKIAABCDEFGHIJKLMNOP";',
      "c.ts": 'export const k = "ghp_abcdefghijklmnopqrstuvwxyz1234567890AB";',
      "d.py": 'api_key = "abcdefghij1234567890"',
    });

    expect(findings.sort()).toEqual(["a.ts:1", "b.ts:1", "c.ts:1", "d.py:1"]);
  });
});

describe("sec/admin-route-no-auth", () => {
  const rule = loadRule("security/admin-route-no-auth");

  it("flags every exported handler in an unauthenticated admin route", async () => {
    // theghost/app/api/admin/users/delete/route.ts, same shape.
    const findings = await findingsFor(rule, {
      "app/api/admin/users/route.ts": [
        'import { db } from "@/lib/db";',
        "",
        "export async function GET() {",
        "  return Response.json(await db.sql`SELECT id, email FROM users`);",
        "}",
        "",
        "export async function DELETE(request) {",
        "  const { userId } = await request.json();",
        "  await db.users.deleteById(userId);",
        "  return Response.json({ success: true });",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([
      "app/api/admin/users/route.ts:3",
      "app/api/admin/users/route.ts:7",
    ]);
  });

  it("stays quiet once the file checks the caller", async () => {
    const findings = await findingsFor(rule, {
      "app/api/admin/users/route.ts": [
        'import { getSession } from "@/lib/session";',
        "",
        "export async function DELETE(request) {",
        "  const session = await getSession(request);",
        '  if (session === null) return new Response("Unauthorized", { status: 401 });',
        "  return Response.json({ success: true });",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  /**
   * `service_role` must NOT count as an auth marker: a handler reaching for
   * it is bypassing row-level security, which is the opposite of
   * authorizing its caller. newattendanceapp/app/api/admin/users/by-role
   * is this exact shape, and listing service_role would have exempted it.
   */
  it("does not treat a service-role client as authorization", async () => {
    const findings = await findingsFor(rule, {
      "app/api/admin/users/by-role/route.ts": [
        'import { createAdminClient } from "@/lib/supabase/server";',
        "",
        "export async function GET(request) {",
        "  const supabase = createAdminClient();",
        '  const role = request.nextUrl.searchParams.get("role");',
        '  return Response.json(await supabase.from("profiles").select("*").eq("role", role));',
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual(["app/api/admin/users/by-role/route.ts:3"]);
  });

  /**
   * `\bauth\b` cannot match `Authorization` — the trailing `o` defeats the
   * word boundary — so forwarding a header without checking it is still a
   * finding.
   */
  it("does not treat forwarding an Authorization header as a check", async () => {
    const findings = await findingsFor(rule, {
      "app/api/admin/proxy/route.ts": [
        "export async function POST(request) {",
        '  return fetch("https://upstream.example.com", {',
        '    headers: { Authorization: request.headers.get("Authorization") },',
        "  });",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual(["app/api/admin/proxy/route.ts:1"]);
  });

  it("ignores routes with no admin segment", async () => {
    const findings = await findingsFor(rule, {
      "app/api/posts/route.ts":
        "export async function GET() { return Response.json([]); }",
    });

    expect(findings).toEqual([]);
  });

  it("resolves an admin segment nested below the api segment", async () => {
    const findings = await findingsFor(rule, {
      "app/api/v2/admin/stats/route.ts":
        "export async function GET() { return Response.json({}); }",
    });

    expect(findings).toEqual(["app/api/v2/admin/stats/route.ts:1"]);
  });
});

describe("sec/weak-default-credential", () => {
  const rule = loadRule("security/weak-default-credential");

  /**
   * `password123` is the corpus's actual value and an earlier draft of this
   * rule missed it, because the word list enumerated suffixed variants by
   * hand. The optional-numeric-suffix form is what fixed it.
   */
  it.each([
    "password123",
    "admin123",
    "changeme",
    "123456",
    "demo_2024",
    "admin@123",
    "root",
  ])("flags the weak literal %s", async (value) => {
    const findings = await findingsFor(rule, {
      "app/api/admin/seed/route.ts": `const user = { password: "${value}" };`,
    });

    expect(findings).toEqual(["app/api/admin/seed/route.ts:1"]);
  });

  it("ignores the word 'password' used as a value rather than a credential", async () => {
    const findings = await findingsFor(rule, {
      "components/form.tsx": [
        '<label htmlFor="password">Password</label>;',
        '<input id="password" name="password" type="password" placeholder="password" />;',
        '<input autoComplete="current-password" />;',
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("ignores a hash and a schema declaration", async () => {
    const findings = await findingsFor(rule, {
      "lib/auth.ts": [
        "const schema = z.object({ password: z.string().min(12) });",
        'const row = { password: "$2b$12$abcdefghijklmnopqrstuv" };',
        "const value = { password: process.env.OWNER_PASSWORD };",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  /**
   * The control-repo exemption, measured both ways in ADR 0033: with the
   * flag the corpus yields 2 findings and no control hit, without it 3
   * including nextjs/saas-starter's `lib/db/seed.ts`.
   */
  it("exempts a seed script reachable through a package.json script", async () => {
    const findings = await findingsFor(rule, {
      "package.json": JSON.stringify({
        name: "app",
        scripts: { "db:seed": "npx tsx lib/db/seed.ts" },
      }),
      "lib/db/seed.ts": "const password = 'admin123';",
    });

    expect(findings).toEqual([]);
  });

  it("still flags an identical literal in a route handler", async () => {
    const findings = await findingsFor(rule, {
      "package.json": JSON.stringify({
        name: "app",
        scripts: { "db:seed": "npx tsx lib/db/seed.ts" },
      }),
      "app/api/admin/test-users/route.ts": "const password = 'admin123';",
    });

    expect(findings).toEqual(["app/api/admin/test-users/route.ts:1"]);
  });
});
