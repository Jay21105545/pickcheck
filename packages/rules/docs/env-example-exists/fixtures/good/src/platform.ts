// Platform-injected values. Nobody documents these in .env.example because
// nobody sets them — Vercel and the Supabase Edge runtime supply them.
export const isProd = process.env.NODE_ENV === "production";
export const deployUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const supabaseUrl = Deno.env.get("SUPABASE_URL");
declare const Deno: { env: { get(name: string): string | undefined } };
