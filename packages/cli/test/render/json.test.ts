import { describe, expect, it } from "vitest";
import { renderJson } from "../../src/render/json.js";
import { emptyResult, sampleResult } from "./fixtures.js";

describe("renderJson", () => {
  it("matches the snapshot for a result with findings and warnings", () => {
    expect(renderJson(sampleResult)).toMatchSnapshot();
  });

  it("matches the snapshot for a clean result", () => {
    expect(renderJson(emptyResult)).toMatchSnapshot();
  });

  it("is valid JSON with the documented top-level shape", () => {
    const parsed = JSON.parse(renderJson(sampleResult));
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "categories",
        "composite",
        "fileCount",
        "findings",
        "ruleCount",
        "warnings",
      ].sort(),
    );
    expect(parsed.ruleCount).toBe(sampleResult.rules.length);
    expect(parsed.findings).toEqual(sampleResult.findings);
  });
});
