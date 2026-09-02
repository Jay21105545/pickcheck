import type { AuditResult } from "../../src/engine/audit.js";
import type { Rule } from "../../src/engine/types.js";

const rules: Rule[] = [
  {
    id: "sec/no-secrets-in-code",
    category: "security",
    severity: "error",
    title: "Hardcoded secret",
    files: ["**/*.ts"],
    message: "A secret looks hardcoded.",
    weight: 4,
    tier: "exists",
    pattern: { mode: "absent" },
  },
  {
    id: "disc/no-console-log",
    category: "discipline",
    severity: "warn",
    title: "console.log left in",
    files: ["**/*.ts"],
    message: "console.log left in source.",
    weight: 1,
    tier: "regex",
    pattern: { regex: "console\\.log\\(" },
  },
];

/** A result with findings and a stub-tier warning, for the non-empty render path. */
export const sampleResult: AuditResult = {
  rules,
  findings: [
    {
      ruleId: "sec/no-secrets-in-code",
      file: "src/config.ts",
      severity: "error",
      message: "A secret looks hardcoded.",
      fixPrompt:
        'Fix "Hardcoded secret" (sec/no-secrets-in-code) at src/config.ts: A secret looks hardcoded.',
    },
    {
      ruleId: "disc/no-console-log",
      file: "src/index.ts",
      line: 12,
      severity: "warn",
      message: "console.log left in source.",
      fixPrompt:
        'Fix "console.log left in" (disc/no-console-log) at src/index.ts:12: console.log left in source.',
    },
  ],
  score: {
    composite: 97.45,
    categories: [
      { category: "security", score: 92 },
      { category: "quality", score: 100 },
      { category: "docs", score: 100 },
      { category: "discipline", score: 99 },
      { category: "ui-ux", score: 100 },
      { category: "tokens", score: 100 },
    ],
  },
  warnings: [
    "qual/no-empty-catch: astgrep tier not implemented yet (TODO phase-1.1) — skipped",
  ],
  fileCount: 42,
};

/** A perfect, warning-free result, for the empty render path. */
export const emptyResult: AuditResult = {
  rules: [],
  findings: [],
  score: {
    composite: 100,
    categories: [
      { category: "security", score: 100 },
      { category: "quality", score: 100 },
      { category: "docs", score: 100 },
      { category: "discipline", score: 100 },
      { category: "ui-ux", score: 100 },
      { category: "tokens", score: 100 },
    ],
  },
  warnings: [],
  fileCount: 10,
};
