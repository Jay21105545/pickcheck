export function DeleteButton({ id }: { id: string }) {
  async function handleDelete() {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
  }

  return <button onClick={handleDelete}>Delete</button>;
}
