"use client";

import { useActionState } from "react";
import { deleteAccount } from "@/app/actions";

export function DangerZone() {
  const [state, deleteAction] = useActionState(deleteAccount, {});

  return (
    <form action={deleteAction}>
      <button type="submit">Delete account</button>
      {state.error ? <p>{state.error}</p> : null}
    </form>
  );
}
