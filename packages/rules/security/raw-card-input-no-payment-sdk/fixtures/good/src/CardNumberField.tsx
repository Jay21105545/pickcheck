// A wrapper around Stripe's classic split Card Element — still a real,
// supported, PCI-compliant integration. The <Label>/id genuinely say
// "cardNumber", but CardNumberElement is what actually captures the
// digits (inside Stripe's own iframe, never this component's state) —
// this must NOT fire, since @stripe/react-stripe-js is a declared
// dependency. Proves the rule isn't payment-SDK-blind: a literal
// "cardNumber" identifier next to a real SDK import is fine.
import { CardNumberElement } from "@stripe/react-stripe-js";
import { Label } from "@/components/ui/label";

export function CardNumberField() {
  return (
    <div>
      <Label htmlFor="cardNumber">Card Number</Label>
      <CardNumberElement id="cardNumber" />
    </div>
  );
}
