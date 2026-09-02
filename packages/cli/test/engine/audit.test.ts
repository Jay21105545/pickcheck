import { describe, expect, it } from "vitest";
import { runAudit } from "../../src/engine/audit.js";
import { createTempDir } from "../helpers/temp-dir.js";

const consoleLogRule = `
id: disc/no-console-log
category: discipline
severity: warn
title: console.log left in
files: ["**/*.ts"]
message: "console.log left in source."
weight: 2
tier: regex
pattern:
  regex: "console\\\\.log\\\\("
`;

const changelogExistsRule = `
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

describe("runAudit", () => {
  it("wires scan -> load -> dispatch -> score end to end", async () => {
    const repo = await createTempDir("audit-repo");
    const rulesDir = await createTempDir("audit-rules");
    try {
      await repo.write("src/a.ts", "console.log('debug');\nconst x = 1;\n");
      await repo.write("README.md", "# demo repo\n");

      await rulesDir.write("discipline/no-console-log/rule.yaml", consoleLogRule);
      await rulesDir.write("docs/changelog-exists/rule.yaml", changelogExistsRule);
      await rulesDir.write("broken/rule.yaml", "id: [not valid yaml");

      const result = await runAudit({ cwd: repo.path, rulesDir: rulesDir.path });

      expect(result.fileCount).toBe(2); // src/a.ts, README.md
      expect(result.rules.map((r) => r.id).sort()).toEqual([
        "disc/no-console-log",
        "docs/changelog-exists",
      ]);
      expect(result.warnings).toEqual([expect.stringContaining("broken/rule.yaml")]);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "disc/no-console-log",
            file: "src/a.ts",
            line: 1,
          }),
          expect.objectContaining({
            ruleId: "docs/changelog-exists",
            file: "CHANGELOG.md",
          }),
        ]),
      );
      expect(result.findings).toHaveLength(2);

      // discipline: penalty 2*1(warn) / 1 applicable = 2 -> 98
      // docs: penalty 2*1(warn) / 1 applicable = 2 -> 98
      const discipline = result.score.categories.find(
        (c) => c.category === "discipline",
      );
      const docs = result.score.categories.find((c) => c.category === "docs");
      expect(discipline?.score).toBe(98);
      expect(docs?.score).toBe(98);
    } finally {
      await repo.cleanup();
      await rulesDir.cleanup();
    }
  });

  it("returns a perfect score with no warnings when the rules dir is empty", async () => {
    const repo = await createTempDir("audit-clean-repo");
    const rulesDir = await createTempDir("audit-empty-rules");
    try {
      await repo.write("src/a.ts", "const x = 1;\n");

      const result = await runAudit({ cwd: repo.path, rulesDir: rulesDir.path });

      expect(result.findings).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.rules).toEqual([]);
      expect(result.score.composite).toBe(100);
    } finally {
      await repo.cleanup();
      await rulesDir.cleanup();
    }
  });
});
