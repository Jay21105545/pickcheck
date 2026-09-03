export function DeleteButton({ id }: { id: string }) {
  async function handleDelete() {
    if (!window.confirm("Delete this item? This cannot be undone.")) {
      return;
    }
    await fetch(`/api/items/${id}`, { method: "DELETE" });
  }

  return <button onClick={handleDelete}>Delete</button>;
}
