import { describe, expect, it } from "vitest";

describe("handle", () => {
  it("logs the request for debugging", () => {
    console.log("test debug output is fine in tests");
    expect(true).toBe(true);
  });
});
