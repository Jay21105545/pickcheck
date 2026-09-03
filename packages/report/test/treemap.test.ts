import { describe, expect, it } from "vitest";
import { computeTreemap } from "../src/treemap.js";

describe("computeTreemap", () => {
  it("returns nothing for an empty item list", () => {
    expect(computeTreemap([], 0, 0, 100, 100)).toEqual([]);
  });

  it("fills the whole rectangle for a single item", () => {
    const rects = computeTreemap([{ label: "a", value: 10 }], 0, 0, 100, 50);
    expect(rects).toEqual([
      { label: "a", value: 10, x: 0, y: 0, width: 100, height: 50 },
    ]);
  });

  it("partitions the rectangle exactly, with no gaps or overlaps, for uneven values", () => {
    const items = [
      { label: "big", value: 700 },
      { label: "medium", value: 200 },
      { label: "small", value: 100 },
    ];
    const rects = computeTreemap(items, 0, 0, 200, 100);

    expect(rects).toHaveLength(3);
    expect(rects.map((r) => r.label).sort()).toEqual(["big", "medium", "small"]);

    // Total area is exactly preserved regardless of how the recursion split.
    const totalArea = rects.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(totalArea).toBeCloseTo(200 * 100, 6);

    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(200 + 1e-9);
      expect(rect.y + rect.height).toBeLessThanOrEqual(100 + 1e-9);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }

    // The biggest item should get the biggest cell.
    const big = rects.find((r) => r.label === "big");
    const small = rects.find((r) => r.label === "small");
    expect((big?.width ?? 0) * (big?.height ?? 0)).toBeGreaterThan(
      (small?.width ?? 0) * (small?.height ?? 0),
    );
  });

  it("splits evenly by count when every value is zero", () => {
    const items = [
      { label: "a", value: 0 },
      { label: "b", value: 0 },
      { label: "c", value: 0 },
      { label: "d", value: 0 },
    ];
    const rects = computeTreemap(items, 0, 0, 100, 100);
    expect(rects).toHaveLength(4);
    for (const rect of rects) {
      expect(rect.width * rect.height).toBeCloseTo(2500, 6);
    }
  });

  it("handles many items without overlap or gaps", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      label: `file-${i}`,
      value: (i + 1) * 17,
    }));
    const rects = computeTreemap(items, 0, 0, 300, 180);
    expect(rects).toHaveLength(25);
    const totalArea = rects.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(totalArea).toBeCloseTo(300 * 180, 6);
  });
});
