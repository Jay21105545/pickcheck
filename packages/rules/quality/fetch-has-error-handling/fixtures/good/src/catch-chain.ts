export async function loadUsers(): Promise<unknown> {
  const res = await fetch("/api/users").catch((e) => {
    console.error("network error", e);
    return null;
  });
  return res;
}
