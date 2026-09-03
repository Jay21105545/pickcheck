import { describe, expect, it } from "vitest";
import { renderQuietSummary, renderTerminal } from "../../src/render/terminal.js";
import { emptyResult, resultWithIgnoreCoverage, sampleResult } from "./fixtures.js";

/** Temporarily overrides process.env for `fn`, restoring the prior values after. */
function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
  }
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const ESC = String.fromCharCode(27);
const NON_ASCII_GLYPHS = [
  String.fromCharCode(0x250c), // ┌
  String.fromCharCode(0x2502), // │
  String.fromCharCode(0x2514), // └
  String.fromCharCode(0x2500), // ─
  String.fromCharCode(0xb7), // ·
  String.fromCharCode(0x2014), // —
];

describe("renderTerminal", () => {
  it("matches the snapshot for a result with findings and warnings (no color)", () => {
    expect(renderTerminal(sampleResult, { color: false })).toMatchSnapshot();
  });

  it("matches the snapshot for a clean result (no color)", () => {
    expect(renderTerminal(emptyResult, { color: false })).toMatchSnapshot();
  });

  it("matches the snapshot for a dumb terminal (ascii glyphs, no color)", () => {
    expect(
      renderTerminal(sampleResult, { ascii: true, color: false }),
    ).toMatchSnapshot();
  });

  it("stays within ~100 columns per line", () => {
    const output = renderTerminal(sampleResult, { color: false });
    for (const line of output.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(100);
    }
  });

  it("applies ANSI styling when color is explicitly enabled", () => {
    const colored = renderTerminal(sampleResult, { color: true });
    const plain = renderTerminal(sampleResult, { color: false });
    expect(colored).not.toEqual(plain);
    expect(colored).toContain(ESC);
  });

  it("honors NO_COLOR from the environment when color isn't explicitly set", () => {
    withEnv({ NO_COLOR: "1", TERM: undefined }, () => {
      const withNoColor = renderTerminal(sampleResult);
      const explicitlyPlain = renderTerminal(sampleResult, { color: false });
      expect(withNoColor).toEqual(explicitlyPlain);
      expect(withNoColor).not.toContain(ESC);
    });
  });

  it("an explicit color option overrides NO_COLOR from the environment", () => {
    withEnv({ NO_COLOR: "1" }, () => {
      const forced = renderTerminal(sampleResult, { color: true });
      const plain = renderTerminal(sampleResult, { color: false });
      expect(forced).not.toEqual(plain);
      expect(forced).toContain(ESC);
    });
  });

  it("renders an unscored AI-ignore coverage line for an uncovered artifact (DECISIONS/0016)", () => {
    const output = renderTerminal(resultWithIgnoreCoverage, { color: false });
    expect(output).toContain("AI-ignore coverage: 1 artifact(s)");
    expect(output).toContain("no AI-ignore file found");
    expect(output).toContain("pnpm-lock.yaml — not covered");
    // No context files in this fixture, so the token-count line is absent.
    expect(output).not.toContain("AI context surface:");
  });

  it("degrades to ASCII and disables color on TERM=dumb, per DESIGN.md", () => {
    withEnv({ TERM: "dumb", NO_COLOR: undefined }, () => {
      const output = renderTerminal(sampleResult);
      const lines = output.split("\n");
      // Box top, one row per (Score + 6 categories), the counts row, box bottom.
      const cardLines = lines.slice(0, 9);

      expect(output).not.toContain(ESC);
      // The renderer's own decorative glyphs (box, bars, separators, the
      // location/message dash, the fix-hint arrow) degrade to ASCII.
      // Message/warning text is rule-authored content the renderer doesn't
      // own or scrub — the sample fixture's warning legitimately contains
      // an em dash, so these checks target only the lines the renderer
      // itself composes.
      expect(lines[0]).toBe("+- pickcheck audit");
      expect(lines[8]).toContain(" * ");
      expect(lines[9]).toBe("+-");
      expect(output).toContain("src/config.ts - A secret looks hardcoded.");
      expect(output).toContain("-> fix:");
      for (const glyph of NON_ASCII_GLYPHS) {
        for (const line of cardLines) {
          expect(line).not.toContain(glyph);
        }
      }
    });
  });
});

describe("renderQuietSummary", () => {
  it("is a single line carrying the composite score and the same counts", () => {
    const output = renderQuietSummary(sampleResult, { color: false });
    expect(output.trimEnd().split("\n")).toHaveLength(1);
    expect(output).toContain("97.45/100");
    expect(output).toContain("2 rules");
    expect(output).toContain("42 files");
    expect(output).toContain("2 findings");
    // No findings, no fix hints, no warnings — CI wants score + counts only.
    expect(output).not.toContain("fix:");
    expect(output).not.toContain("src/config.ts");
  });

  it("degrades to ASCII on TERM=dumb", () => {
    withEnv({ TERM: "dumb", NO_COLOR: undefined }, () => {
      const output = renderQuietSummary(sampleResult);
      expect(output).not.toContain(ESC);
      expect(output).toContain(" * ");
    });
  });

  it("honors an explicit color option", () => {
    const colored = renderQuietSummary(sampleResult, { color: true });
    expect(colored).toContain(ESC);
  });
});
