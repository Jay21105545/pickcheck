export async function fetchUser(id: string): Promise<unknown> {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  try {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
  } catch (_e) {}
}
