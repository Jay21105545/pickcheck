export const apiKey = process.env.API_KEY;
export const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";

export function charge(amount: number): void {
  console.log(`charging ${amount} using the configured key`);
}
