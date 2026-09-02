import { describe, expect, it } from "vitest";
import { getVersion } from "../src/version.js";

describe("getVersion", () => {
  it("reads a semver string from package.json", () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
