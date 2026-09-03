export interface TreemapItem {
  label: string;
  value: number;
}

export interface TreemapRect extends TreemapItem {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Slice-and-dice treemap: recursively splits the (caller-sorted) item list
 * in half by cumulative value, alternating the split axis with whichever
 * side of the remaining rectangle is longer. Chosen over a squarified
 * layout (nicer aspect ratios, more moving parts) because this report only
 * ever treemaps a handful of AI-context files (DECISIONS/0019) — simplicity
 * and an easy-to-verify "rects exactly partition the input rectangle, no
 * gaps or overlaps" property matter more here than optimal cell shapes.
 */
export function computeTreemap(
  items: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number,
): TreemapRect[] {
  if (items.length === 0) {
    return [];
  }
  if (items.length === 1) {
    const [item] = items as [TreemapItem];
    return [{ ...item, x, y, width, height }];
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const splitIndex =
    total > 0 ? findBalancedSplit(items, total) : Math.ceil(items.length / 2);

  const left = items.slice(0, splitIndex);
  const right = items.slice(splitIndex);
  const leftTotal = left.reduce((sum, item) => sum + item.value, 0);
  // Degenerate all-zero-value case: split the rectangle evenly by count
  // instead of by (zero) value share, so every item still gets a cell.
  const leftFraction = total > 0 ? leftTotal / total : left.length / items.length;

  if (width >= height) {
    const leftWidth = width * leftFraction;
    return [
      ...computeTreemap(left, x, y, leftWidth, height),
      ...computeTreemap(right, x + leftWidth, y, width - leftWidth, height),
    ];
  }
  const leftHeight = height * leftFraction;
  return [
    ...computeTreemap(left, x, y, width, leftHeight),
    ...computeTreemap(right, x, y + leftHeight, width, height - leftHeight),
  ];
}

/** Index (1..items.length-1) that splits `items` into two halves closest to an even value split. */
function findBalancedSplit(items: TreemapItem[], total: number): number {
  let cumulative = 0;
  let bestIndex = 1;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < items.length - 1; i++) {
    cumulative += items[i]?.value ?? 0;
    const diff = Math.abs(cumulative - total / 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i + 1;
    }
  }

  return bestIndex;
}
