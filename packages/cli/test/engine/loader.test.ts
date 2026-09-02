import { describe, expect, it } from "vitest";
import { loadRules } from "../../src/engine/loader.js";
import { createTempDir } from "../helpers/temp-dir.js";

const validExistsRule = `
id: docs/changelog-exists
category: docs
severity: warn
title: CHANGELOG missing
files: ["CHANGELOG.md"]
message: "No CHANGELOG.md found."
weight: 2
tier: exists
pattern:
  mode: present
`;

const validRegexRule = `
id: disc/no-console-log
category: discipline
severity: info
title: console.log left in
files: ["**/*.ts"]
message: "console.log left in source."
weight: 1
tier: regex
pattern:
  regex: "console\\\\.log\\\\("
`;

describe("loadRules", () => {
  it("loads every valid rule.yaml under the rules dir", async () => {
    const dir = await createTempDir("loader-valid");
    try {
      await dir.write("docs/changelog-exists/rule.yaml", validExistsRule);
      await dir.write("discipline/no-console-log/rule.yaml", validRegexRule);

      const result = await loadRules(dir.path);

      expect(result.warnings).toEqual([]);
      expect(result.rules.map((rule) => rule.id).sort()).toEqual([
        "disc/no-console-log",
        "docs/changelog-exists",
      ]);
    } finally {
      await dir.cleanup();
    }
  });

  it("ignores files that aren't named rule.yaml", async () => {
    const dir = await createTempDir("loader-ignore-others");
    try {
      await dir.write("docs/changelog-exists/rule.yaml", validExistsRule);
      await dir.write("docs/changelog-exists/README.md", "# why this rule exists");
      await dir.write("docs/changelog-exists/fixtures/bad/repo/nothing.ts", "");

      const result = await loadRules(dir.path);

      expect(result.rules).toHaveLength(1);
    } finally {
      await dir.cleanup();
    }
  });

  it("skips a rule.yaml with invalid YAML syntax, with a warning, and keeps going", async () => {
    const dir = await createTempDir("loader-bad-yaml");
    try {
      await dir.write("broken/rule.yaml", "id: [this is not: valid yaml");
      await dir.write("docs/changelog-exists/rule.yaml", validExistsRule);

      const result = await loadRules(dir.path);

      expect(result.rules.map((rule) => rule.id)).toEqual(["docs/changelog-exists"]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("broken/rule.yaml");
    } finally {
      await dir.cleanup();
    }
  });

  it("skips a rule.yaml that fails schema validation, with a warning, and keeps going", async () => {
    const dir = await createTempDir("loader-bad-schema");
    try {
      await dir.write(
        "invalid/rule.yaml",
        `
id: not-a-valid-id-shape
category: security
severity: error
title: Bad rule
files: ["**/*.ts"]
message: "This rule is malformed."
weight: 1
tier: exists
pattern:
  mode: present
`,
      );
      await dir.write("docs/changelog-exists/rule.yaml", validExistsRule);

      const result = await loadRules(dir.path);

      expect(result.rules.map((rule) => rule.id)).toEqual(["docs/changelog-exists"]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("invalid/rule.yaml");
    } finally {
      await dir.cleanup();
    }
  });

  it("returns no rules and no warnings for an empty rules dir", async () => {
    const dir = await createTempDir("loader-empty");
    try {
      const result = await loadRules(dir.path);

      expect(result.rules).toEqual([]);
      expect(result.warnings).toEqual([]);
    } finally {
      await dir.cleanup();
    }
  });
});
