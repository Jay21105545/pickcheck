// A Supabase Edge Function is an HTTP surface just as much as an
// app/api/ route, and needs documenting the same way.
Deno.serve(async () => new Response(JSON.stringify({ ok: true })));

declare const Deno: { serve(handler: () => Promise<Response>): void };
