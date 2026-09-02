export const STRIPE_SECRET_KEY = "sk-1234567890abcdefghijklmnop";

export function charge(amount: number): void {
  console.log(`charging ${amount} with ${STRIPE_SECRET_KEY}`);
}
