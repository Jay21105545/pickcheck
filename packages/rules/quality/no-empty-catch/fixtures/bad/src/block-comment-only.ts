export function save(data: unknown): void {
  try {
    persist(data);
  } catch (e) {
    /* swallowed intentionally, or so the comment claims */
  }
}

declare function persist(data: unknown): void;
