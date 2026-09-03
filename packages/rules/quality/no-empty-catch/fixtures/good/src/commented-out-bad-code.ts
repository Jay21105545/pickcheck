// Old version, kept for reference:
// try { persist(data); } catch (e) {}
export function save(data: unknown): void {
  try {
    persist(data);
  } catch (e) {
    logError(e);
  }
}

declare function persist(data: unknown): void;
declare function logError(e: unknown): void;
