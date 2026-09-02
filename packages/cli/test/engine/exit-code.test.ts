import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_SCORE, getExitCode } from "../../src/engine/exit-code.js";

describe("getExitCode", () => {
  it("defaults --min to 60", () => {
    expect(DEFAULT_MIN_SCORE).toBe(60);
  });

  it("exits 0 when composite is above the minimum", () => {
    expect(getExitCode(75)).toBe(0);
  });

  it("exits 0 when composite equals the minimum (>=, not >)", () => {
    expect(getExitCode(60)).toBe(0);
  });

  it("exits 1 when composite is below the minimum", () => {
    expect(getExitCode(59)).toBe(1);
  });

  it("respects a custom --min", () => {
    expect(getExitCode(85, 90)).toBe(1);
    expect(getExitCode(90, 90)).toBe(0);
  });
});
