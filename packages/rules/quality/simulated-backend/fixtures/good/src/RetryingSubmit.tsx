// An awaited delay that IS legitimate: backoff between real attempts.
// The file makes network calls, so `unless` clears it — this is the
// sports-on-the-go `geocode` shape.
export function RetryingSubmit() {
  const handleSubmit = async (payload) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch("/api/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return res.json();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
    throw new Error("Order failed after 3 attempts");
  };

  return <form onSubmit={handleSubmit} />;
}
