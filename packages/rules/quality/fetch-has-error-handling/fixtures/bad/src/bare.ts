export async function loadUsers(): Promise<unknown> {
  const res = await fetch("/api/users");
  return res.json();
}
