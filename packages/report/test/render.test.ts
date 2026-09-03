import { describe, expect, it } from "vitest";
import { renderReportHtml } from "../src/render.js";
import type { ReportData, ReportFinding } from "../src/types.js";

const baseCategories: ReportData["categories"] = [
  { category: "security", score: 92, weight: 0.3 },
  { category: "quality", score: 100, weight: 0.2 },
  { category: "docs", score: 100, weight: 0.15 },
  { category: "discipline", score: 71.43, weight: 0.15 },
  { category: "ui-ux", score: 100, weight: 0.1 },
  { category: "tokens", score: 100, weight: 0.1 },
];

function finding(overrides: Partial<ReportFinding>): ReportFinding {
  return {
    ruleId: "sec/no-secrets-in-code",
    ruleTitle: "Hardcoded secret",
    category: "security",
    severity: "error",
    file: "src/config.ts",
    line: 3,
    message: "A secret looks hardcoded.",
    fixPrompt: 'Fix "Hardcoded secret" (sec/no-secrets-in-code) at src/config.ts:3.',
    snippet: undefined,
    ...overrides,
  };
}

function baseData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    repoName: "demo-repo",
    generatedAt: "2026-09-03T12:00:00.000Z",
    pickcheckVersion: "0.0.1",
    rulesetVersion: "abc123def456",
    composite: 88.5,
    previous: undefined,
    history: [{ timestamp: "2026-09-03T12:00:00.000Z", composite: 88.5 }],
    categories: baseCategories,
    findings: [],
    warnings: [],
    fileCount: 42,
    ruleCount: 12,
    tokenSurface: undefined,
    ...overrides,
  };
}

describe("renderReportHtml", () => {
  it("renders a complete standalone document with no external network references", () => {
    const html = renderReportHtml(
      baseData({
        findings: [finding({})],
        tokenSurface: {
          files: [{ file: "CLAUDE.md", tokens: 612 }],
          totalTokens: 612,
          estimatedWastePercent: 5.5,
          ignoreFilesFound: [],
          uncoveredArtifacts: [],
        },
      }),
    );

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/cdn\.|fonts\.googleapis|fonts\.gstatic/i);
  });

  it("HTML-escapes finding messages, file paths, and snippet code — never injects raw markup", () => {
    const html = renderReportHtml(
      baseData({
        findings: [
          finding({
            file: "<script>evil</script>.ts",
            message: "<img src=x onerror=alert(1)>",
            snippet: [
              {
                number: 1,
                text: "</script><script>alert(2)</script>",
                highlighted: true,
              },
            ],
          }),
        ],
      }),
    );

    expect(html).not.toContain("<script>evil</script>.ts");
    expect(html).toContain("&lt;script&gt;evil&lt;/script&gt;.ts");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // The malicious snippet text must never appear as a literal, HTML-parseable </script> —
    // only inside our own two legitimate <script> blocks (the JSON data island and the client script).
    const scriptCloseCount = (html.match(/<\/script>/gi) ?? []).length;
    expect(scriptCloseCount).toBe(2);
  });

  it("never breaks out of the embedded JSON via a fix prompt containing </script>", () => {
    const html = renderReportHtml(
      baseData({
        findings: [
          finding({
            fixPrompt: "Paste this </script><script>alert(3)</script> verbatim.",
          }),
        ],
      }),
    );

    const scriptCloseCount = (html.match(/<\/script>/gi) ?? []).length;
    expect(scriptCloseCount).toBe(2);
    expect(html).toContain("\\u003c/script>");
  });

  it("sorts findings by category then severity and keeps the fix-prompt JSON aligned with each card's index", () => {
    const findings = [
      finding({ category: "ui-ux", severity: "info", fixPrompt: "fix-ux-info" }),
      finding({ category: "security", severity: "warn", fixPrompt: "fix-sec-warn" }),
      finding({ category: "security", severity: "error", fixPrompt: "fix-sec-error" }),
    ];
    const html = renderReportHtml(baseData({ findings }));

    const jsonMatch = html.match(
      /<script type="application\/json" id="pickcheck-fix-prompts">([^<]*)<\/script>/,
    );
    expect(jsonMatch).not.toBeNull();
    const embedded = JSON.parse(jsonMatch?.[1] ?? "[]") as string[];
    // categories array order is security, quality, docs, discipline, ui-ux, tokens;
    // within security, error ranks before warn.
    expect(embedded).toEqual(["fix-sec-error", "fix-sec-warn", "fix-ux-info"]);

    // Each rendered card's data-finding-index must point at its own prompt.
    const indexMatches = [...html.matchAll(/data-finding-index="(\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(indexMatches.sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("shows a first-run message when there is no previous run", () => {
    const html = renderReportHtml(baseData({ previous: undefined }));
    expect(html).toContain("First recorded run");
  });

  it("shows the trend delta, and a ruleset-changed caveat only when the ruleset differs", () => {
    const same = renderReportHtml(
      baseData({
        previous: {
          composite: 70,
          timestamp: "2026-09-01T00:00:00.000Z",
          sameRuleset: true,
        },
      }),
    );
    expect(same).toContain("70 → 88.5 since last run");
    expect(same).not.toContain("ruleset changed");

    const changed = renderReportHtml(
      baseData({
        previous: {
          composite: 70,
          timestamp: "2026-09-01T00:00:00.000Z",
          sameRuleset: false,
        },
      }),
    );
    expect(changed).toContain("ruleset changed since last run");
  });

  it("omits the token-surface section entirely when there is nothing to report", () => {
    const html = renderReportHtml(baseData({ tokenSurface: undefined }));
    expect(html).not.toContain("AI context surface");
  });

  it("renders an empty state when there are no findings", () => {
    const html = renderReportHtml(baseData({ findings: [] }));
    expect(html).toContain("No findings. Every checked rule passed.");
  });

  it("renders warnings when present and omits the section when empty", () => {
    const withWarnings = renderReportHtml(
      baseData({ warnings: ["astgrep tier not implemented"] }),
    );
    expect(withWarnings).toContain("astgrep tier not implemented");

    const withoutWarnings = renderReportHtml(baseData({ warnings: [] }));
    expect(withoutWarnings).not.toContain('id="warnings-heading"');
  });
});
