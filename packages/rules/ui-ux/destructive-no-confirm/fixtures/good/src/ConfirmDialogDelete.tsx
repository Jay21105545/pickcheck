import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function DeleteButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);

  async function handleConfirmedDelete() {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    setOpen(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)}>Delete</button>
      <ConfirmDialog
        open={open}
        onConfirm={handleConfirmedDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
