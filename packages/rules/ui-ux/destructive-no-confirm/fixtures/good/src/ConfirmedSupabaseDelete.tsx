import { AlertDialog, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

export function DeleteHabit({ habitId }: { habitId: string }) {
  const [open, setOpen] = useState(false);

  async function handleConfirmedDelete() {
    await supabase
      .from("habits")
      .delete()
      .eq("id", habitId);
    setOpen(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)}>Delete habit</button>
      <AlertDialog open={open}>
        <AlertDialogAction onClick={handleConfirmedDelete}>Delete</AlertDialogAction>
        <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
      </AlertDialog>
    </>
  );
}
