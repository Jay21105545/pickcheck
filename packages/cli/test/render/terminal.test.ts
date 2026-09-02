import { describe, expect, it } from "vitest";
import { renderTerminal } from "../../src/render/terminal.js";
import { emptyResult, sampleResult } from "./fixtures.js";

describe("renderTerminal", () => {
  it("matches the snapshot for a result with findings and warnings (no color)", () => {
    expect(renderTerminal(sampleResult, { color: false })).toMatchSnapshot();
  });

  it("matches the snapshot for a clean result (no color)", () => {
    expect(renderTerminal(emptyResult, { color: false })).toMatchSnapshot();
  });

  it("stays within ~100 columns per line", () => {
    const output = renderTerminal(sampleResult, { color: false });
    for (const line of output.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(100);
    }
  });

  it("applies ANSI styling when color is enabled (default)", () => {
    const colored = renderTerminal(sampleResult);
    const plain = renderTerminal(sampleResult, { color: false });
    expect(colored).not.toEqual(plain);
  });
});
