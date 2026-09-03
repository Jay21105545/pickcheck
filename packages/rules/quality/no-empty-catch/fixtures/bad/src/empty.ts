export function save(data: unknown): void {
  try {
    persist(data);
  } catch (e) {}
}

declare function persist(data: unknown): void;
