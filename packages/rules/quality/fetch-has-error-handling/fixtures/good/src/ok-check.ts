export async function loadUsers(): Promise<unknown> {
  const res = await fetch("/api/users");
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return res.json();
}
