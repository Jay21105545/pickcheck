"use client";

// Real shape from vercel/commerce components/cart/delete-item-button.tsx:15,
// which flagged as a false positive during DECISIONS/0027 calibration.
// Removing a line item from a shopping cart is routine and reversible —
// re-add it and nothing is lost. This is why the rule matches `delete` and
// `destroy` in a Server Action name but NOT `remove`.
import { useActionState } from "react";
import { removeItem } from "@/components/cart/actions";

export function DeleteItemButton({ merchandiseId }: { merchandiseId: string }) {
  const [message, formAction] = useActionState(removeItem, null);

  return (
    <form action={formAction.bind(null, merchandiseId)}>
      <button type="submit" aria-label="Remove cart item">x</button>
      <p aria-live="polite" className="sr-only">{message}</p>
    </form>
  );
}
