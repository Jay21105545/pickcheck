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
 * Regression suite for DECISIONS/0028 — the three backend-coverage rules.
 *
 * Same contract as phase1-recall-fixes.test.ts: load the REAL rule.yaml
 * and run it against the REAL shapes that were hand-classified in the
 * corpus. The fixtures/bad + fixtures/good harness only asserts "≥1
 * finding" and "0 findings" per rule, so it cannot pin *which*
 * alternative fired or which precondition did the excluding — and for
 * these three rules the exclusions are the whole calibration.
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
    temp = await createTempDir("pickcheck-phase2");
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

describe("sec/edge-function-no-auth", () => {
  const rule = loadRule("security/edge-function-no-auth");

  it("flags every function block that disables JWT verification", async () => {
    // sports-on-the-go/supabase/config.toml, verbatim shape.
    const findings = await findingsFor(rule, {
      "supabase/config.toml": [
        'project_id = "yayobpcaesnsybextnna"',
        "",
        "[functions.moderate-content]",
        "verify_jwt = false",
        "",
        "[functions.chat-sporty]",
        "verify_jwt = false",
      ].join("\n"),
    });

    expect(findings).toEqual(["supabase/config.toml:4", "supabase/config.toml:7"]);
  });

  it("does not flag verify_jwt = true", async () => {
    // mindtrack's config, which opts IN — the control for the rule.
    const findings = await findingsFor(rule, {
      "supabase/config.toml": [
        'project_id = "xzjwdrxpwwfyceytyalh"',
        "",
        "[functions.chat]",
        "verify_jwt = true",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("does not flag a function block that omits verify_jwt (platform default is true)", async () => {
    const findings = await findingsFor(rule, {
      "supabase/config.toml": [
        "[functions.delete-account]",
        'import_map = "./functions/delete-account/import_map.json"',
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("does not flag a commented-out declaration", async () => {
    const findings = await findingsFor(rule, {
      "supabase/config.toml": ["[functions.chat]", "# verify_jwt = false"].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("resolves a config nested below the repo root", async () => {
    const findings = await findingsFor(rule, {
      "apps/web/supabase/config.toml": "[functions.chat]\nverify_jwt = false\n",
    });

    expect(findings).toEqual(["apps/web/supabase/config.toml:2"]);
  });
});

describe("qual/supabase-result-unchecked", () => {
  const rule = loadRule("quality/supabase-result-unchecked");

  it("flags a multi-line write whose result is discarded", async () => {
    // sports-on-the-go/src/contexts/AuthContext.tsx:110 — the update runs,
    // the error is dropped, and "Welcome back!" renders regardless.
    const findings = await findingsFor(rule, {
      "src/AuthContext.tsx": [
        "export async function signIn(userId) {",
        "  await supabase",
        '    .from("profiles")',
        "    .update({ last_login_at: new Date().toISOString() })",
        '    .eq("id", userId);',
        "",
        '  toast.success("Welcome back!");',
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual(["src/AuthContext.tsx:2"]);
  });

  it("flags a single-line insert and an rpc", async () => {
    const findings = await findingsFor(rule, {
      "src/notify.ts": [
        'await supabase.from("notifications").insert({ user_id: id });',
        'await supabase.rpc("clean_old_rate_limits");',
      ].join("\n"),
    });

    expect(findings).toEqual(["src/notify.ts:1", "src/notify.ts:2"]);
  });

  it("flags a discarded write even inside a try/catch, because supabase-js never throws", async () => {
    const findings = await findingsFor(rule, {
      "src/announce.ts": [
        "try {",
        '  await supabase.from("posts").insert({ content });',
        "} catch (error) {",
        '  console.error("failed", error);',
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual(["src/announce.ts:2"]);
  });

  it("does not flag a destructured or bound result", async () => {
    const findings = await findingsFor(rule, {
      "src/checked.ts": [
        'const { error } = await supabase.from("profiles").update(values);',
        "const { data } = await supabase",
        '  .from("profiles")',
        '  .select("username");',
        'const result = await supabase.from("rows").insert(row);',
        'return await supabase.from("rows").delete().eq("id", id);',
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("does not flag the auth and storage namespaces", async () => {
    // Six corpus call sites live here; ADR 0028 measured them as noise.
    const findings = await findingsFor(rule, {
      "src/session.ts": [
        "await supabase.auth.signOut();",
        'await supabase.storage.from("avatars").remove([path]);',
        "await supabase.storage",
        '  .from("avatars")',
        "  .remove([path]);",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("does not flag query builders passed as Promise.all elements", async () => {
    // mindtrack ExportReport.tsx / delete-account: indented exactly like a
    // discarded statement, but the line starts with the client, not await.
    const findings = await findingsFor(rule, {
      "src/export.ts": [
        "const [habits, water] = await Promise.all([",
        '  supabase.from("habits").select("*"),',
        '  supabase.from("water_intake").select("*"),',
        "]);",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("flags a renamed second client", async () => {
    const findings = await findingsFor(rule, {
      "src/admin.ts": 'await supabaseAdmin.from("posts").insert({ content });',
    });

    expect(findings).toEqual(["src/admin.ts:1"]);
  });
});

describe("qual/simulated-backend", () => {
  const rule = loadRule("quality/simulated-backend");

  it("flags an awaited fake delay in a checkout handler", async () => {
    // shelfly-creator-hub/src/pages/CheckoutPage.tsx:45.
    const findings = await findingsFor(rule, {
      "src/CheckoutPage.tsx": [
        "const handleSubmit = async (e) => {",
        "  e.preventDefault();",
        "  setIsSubmitting(true);",
        "  // Simulate checkout process",
        "  await new Promise(resolve => setTimeout(resolve, 1500));",
        "  setIsCompleted(true);",
        "};",
      ].join("\n"),
    });

    expect(findings).toEqual(["src/CheckoutPage.tsx:5"]);
  });

  it("does not flag a backoff sleep in a file that makes real requests", async () => {
    // sports-on-the-go/supabase/functions/geocode/index.ts:103 — a real
    // retry pause between two live geocoding calls.
    const findings = await findingsFor(rule, {
      "src/submitOrder.ts": [
        "export async function handleSubmitOrder(payload) {",
        '  const res = await fetch("/api/orders", { method: "POST", body: payload });',
        "  if (res.ok) return res.json();",
        "  await new Promise(resolve => setTimeout(resolve, 1000));",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("does not flag an awaited delay in a file with no submit handler", async () => {
    const findings = await findingsFor(rule, {
      "src/animate.ts": [
        "export async function playIntro(setStep) {",
        "  setStep(1);",
        "  await new Promise(resolve => setTimeout(resolve, 300));",
        "  setStep(2);",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("does not flag debounce or optimistic-UI timers in a handler file", async () => {
    const findings = await findingsFor(rule, {
      "src/useAutosave.ts": [
        "export function useAutosave(value, onSave) {",
        "  useEffect(() => {",
        "    const handleSave = () => onSave(value);",
        "    const timer = setTimeout(handleSave, 400);",
        "    return () => clearTimeout(timer);",
        "  }, [value, onSave]);",
        "}",
      ].join("\n"),
      "src/OptimisticLike.tsx": [
        "const handleSaveLike = () => {",
        "  setJustSaved(true);",
        "  setTimeout(() => setJustSaved(false), 2000);",
        "};",
      ].join("\n"),
    });

    expect(findings).toEqual([]);
  });

  it("matches the parenthesised-parameter and block-body arrow forms", async () => {
    const findings = await findingsFor(rule, {
      "src/a.tsx": [
        "async function handleSubmit() {",
        "  await new Promise((resolve) => setTimeout(resolve, 1500));",
        "}",
      ].join("\n"),
      "src/b.tsx": [
        "async function handleSendMessage() {",
        "  await new Promise(resolve => { setTimeout(resolve, 1000); });",
        "}",
      ].join("\n"),
    });

    expect(findings).toEqual(["src/a.tsx:2", "src/b.tsx:2"]);
  });
});
