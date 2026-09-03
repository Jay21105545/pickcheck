export function save(data: unknown): void {
  try {
    persist(data);
  } catch (e) {
    // Non-fatal — log and move on.
    console.warn("persist failed", e);
  }
}

declare function persist(data: unknown): void;
