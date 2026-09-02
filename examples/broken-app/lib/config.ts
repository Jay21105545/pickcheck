// Wired up quickly to get Stripe working locally — never rotated,
// never moved to an environment variable.
export const STRIPE_SECRET_KEY = "sk-1234567890abcdefghijklmnop";

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  stripeSecretKey: STRIPE_SECRET_KEY,
};
