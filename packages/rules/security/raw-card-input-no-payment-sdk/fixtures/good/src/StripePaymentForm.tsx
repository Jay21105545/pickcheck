// Stripe's Payment Element — the recommended, PCI-compliant integration.
// No field here is named/labeled "cardNumber"/"cvc"/"expiry" at all:
// PaymentElement renders and owns every input itself, inside Stripe's own
// iframe. The raw card digits never become this app's state.
import type { FormEvent } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

export function StripePaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) {
      return;
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
    });
    if (!error) {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit">Pay</button>
    </form>
  );
}
