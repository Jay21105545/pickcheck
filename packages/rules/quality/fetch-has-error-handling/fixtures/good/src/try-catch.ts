export async function loadUsers(): Promise<unknown> {
  try {
    const res = await fetch("/api/users");
    return await res.json();
  } catch (e) {
    console.error("failed to load users", e);
    return null;
  }
}
