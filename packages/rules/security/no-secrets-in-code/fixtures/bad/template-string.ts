// A secret pasted whole into a template literal is still a contiguous,
// matchable run of characters — the regex doesn't care which quote style
// surrounds it.
export const STRIPE_SECRET_KEY = `sk-1234567890abcdefghijklmnop`;

export const config = {
  greeting: `Loaded key ${STRIPE_SECRET_KEY.slice(0, 4)}...`,
};
