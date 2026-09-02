import { describe, expect, it } from "vitest";
import { renderTerminal } from "../../src/render/terminal.js";
import { emptyResult, sampleResult } from "./fixtures.js";

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

  it("degrades to ASCII and disables color on TERM=dumb, per DESIGN.md", () => {
    withEnv({ TERM: "dumb", NO_COLOR: undefined }, () => {
      const output = renderTerminal(sampleResult);
      const lines = output.split("\n");

      expect(output).not.toContain(ESC);
      // The renderer's own decorative glyphs (box, separators, the
      // location/message dash) degrade to ASCII. Message/warning text is
      // rule-authored content the renderer doesn't own or scrub — the
      // sample fixture's warning legitimately contains an em dash, so
      // these checks target only the lines the renderer itself composes.
      expect(lines[0]).toBe("+- pickcheck audit");
      expect(lines[2]).toContain(" * ");
      expect(lines[3]).toBe("+-");
      expect(output).toContain("src/config.ts - A secret looks hardcoded.");
      for (const glyph of NON_ASCII_GLYPHS) {
        expect(lines[0]).not.toContain(glyph);
        expect(lines[1]).not.toContain(glyph);
        expect(lines[2]).not.toContain(glyph);
        expect(lines[3]).not.toContain(glyph);
      }
    });
  });
});
