// The corpus shape: a card form that takes the details, waits 1.5s, and
// declares the payment successful. Nothing leaves the browser.
export function CheckoutPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate checkout process
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsSubmitting(false);
    setIsCompleted(true);
  };

  return <form onSubmit={handleSubmit}>{isCompleted ? "Payment Successful!" : null}</form>;
}
