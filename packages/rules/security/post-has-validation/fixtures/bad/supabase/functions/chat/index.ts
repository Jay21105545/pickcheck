// Real shape from sports-on-the-go/supabase/functions/chat-sporty/index.ts.
// Note `req.json()`, not `request.json()` — the original regex hardcoded
// `request`, so widening the glob alone would still have matched nothing.
Deno.serve(async (req: Request) => {
  const { messages } = await req.json();
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  return new Response(response.body);
});

declare const Deno: { serve(handler: (req: Request) => Promise<Response>): void };
