import { describe, expect, it } from "vitest";
import { resolveTerminalMode } from "../../src/render/terminal-mode.js";

describe("resolveTerminalMode", () => {
  it("defaults to color on, ASCII off, in a plain environment", () => {
    expect(resolveTerminalMode({})).toEqual({ color: true, ascii: false });
  });

  it("NO_COLOR present disables color, regardless of its value", () => {
    expect(resolveTerminalMode({ NO_COLOR: "1" })).toEqual({
      color: false,
      ascii: false,
    });
    expect(resolveTerminalMode({ NO_COLOR: "" })).toEqual({
      color: false,
      ascii: false,
    });
    expect(resolveTerminalMode({ NO_COLOR: "0" })).toEqual({
      color: false,
      ascii: false,
    });
  });

  it("TERM=dumb disables both color and Unicode glyphs", () => {
    expect(resolveTerminalMode({ TERM: "dumb" })).toEqual({
      color: false,
      ascii: true,
    });
  });

  it("a non-dumb TERM does not trigger ASCII mode", () => {
    expect(resolveTerminalMode({ TERM: "xterm-256color" })).toEqual({
      color: true,
      ascii: false,
    });
  });

  it("NO_COLOR and TERM=dumb together still resolve to color off, ascii on", () => {
    expect(resolveTerminalMode({ NO_COLOR: "1", TERM: "dumb" })).toEqual({
      color: false,
      ascii: true,
    });
  });
});
