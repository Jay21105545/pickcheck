// A Supabase Edge Function. `console.log` here is not leftover debugging —
// it is the only way to instrument a Deno edge function, and it is what
// the Supabase dashboard's Functions log viewer reads. Real shape from
// sports-on-the-go/supabase/functions/geocode/index.ts, which contributed
// 36 of that repo's 84 findings before DECISIONS/0027.
Deno.serve(async (req: Request) => {
  const body = await req.json();
  console.log("[notify] request received", JSON.stringify(body));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

declare const Deno: { serve(handler: (req: Request) => Promise<Response>): void };
