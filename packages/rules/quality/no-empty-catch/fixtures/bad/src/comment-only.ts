export function save(data: unknown): void {
  try {
    persist(data);
  } catch (e) {
    // TODO: handle this properly later
  }
}

declare function persist(data: unknown): void;
