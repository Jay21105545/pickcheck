export async function loadUsers(): Promise<unknown> {
  const data = await fetch("/api/users").then((r) => r.json());
  return data;
}
