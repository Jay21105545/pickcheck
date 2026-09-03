export function DeleteUserButton({ id }: { id: string }) {
  async function handleDelete() {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
  }

  return <button onClick={handleDelete}>Delete user</button>;
}
