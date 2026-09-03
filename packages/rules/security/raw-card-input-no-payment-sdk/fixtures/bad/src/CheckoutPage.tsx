// Real shape from a Lovable-generated storefront's checkout page
// (DECISIONS/0018) — raw card fields as plain component state, no
// payment SDK anywhere in this project's dependencies.
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CheckoutPage() {
  const [checkoutInfo, setCheckoutInfo] = useState({
    email: "",
    name: "",
    cardNumber: "",
    expiry: "",
    cvc: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCheckoutInfo((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <form>
      <Label htmlFor="cardNumber">Card Number</Label>
      <Input
        id="cardNumber"
        name="cardNumber"
        value={checkoutInfo.cardNumber}
        onChange={handleChange}
      />

      <Label htmlFor="expiry">Expiry Date</Label>
      <Input id="expiry" name="expiry" value={checkoutInfo.expiry} onChange={handleChange} />

      <Label htmlFor="cvc">CVC</Label>
      <Input id="cvc" name="cvc" value={checkoutInfo.cvc} onChange={handleChange} />
    </form>
  );
}
