export function save(data: unknown): void {
  try {
    persist(data);
  } catch (e) {
    console.error("failed to persist", e);
  }
}

declare function persist(data: unknown): void;
