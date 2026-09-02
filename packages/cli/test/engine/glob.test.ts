import { describe, expect, it } from "vitest";
import { matchesAnyGlob } from "../../src/engine/glob.js";

describe("matchesAnyGlob", () => {
  it("matches a plain positive glob", () => {
    expect(matchesAnyGlob(["src/index.ts"], ["**/*.ts"])).toBe(true);
    expect(matchesAnyGlob(["src/index.py"], ["**/*.ts"])).toBe(false);
  });

  it("respects a `!` exclusion when nothing else in the list matches", () => {
    // Regression: micromatch.some() tests each pattern independently, so a
    // lone "!**/fixtures/**" pattern matches almost anything by itself
    // (not being under fixtures/ satisfies the negation on its own),
    // making .some() return true here even though the real, intended
    // question — "does anything match app/api/** once fixtures/ content
    // is excluded" — should be false.
    const files = ["packages/rules/foo/fixtures/bad/app/api/users/route.ts"];
    expect(matchesAnyGlob(files, ["app/api/**", "!**/fixtures/**"])).toBe(false);
  });

  it("still matches when a real, non-excluded file matches", () => {
    const files = [
      "packages/rules/foo/fixtures/bad/app/api/users/route.ts",
      "app/api/users/route.ts",
    ];
    expect(matchesAnyGlob(files, ["app/api/**", "!**/fixtures/**"])).toBe(true);
  });

  it("treats dotfiles as ordinary path segments (dot: true)", () => {
    expect(matchesAnyGlob(["packages/foo/fixtures/bad/.env"], ["**/.env"])).toBe(true);
    expect(
      matchesAnyGlob(
        ["packages/foo/fixtures/bad/.env"],
        ["**/.env", "!**/fixtures/**"],
      ),
    ).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(matchesAnyGlob([], ["**/*.ts"])).toBe(false);
  });
});
