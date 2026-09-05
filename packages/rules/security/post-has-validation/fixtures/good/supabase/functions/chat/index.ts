import { z } from "https://esm.sh/zod@3.23.8";

const payloadSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20),
});

Deno.serve(async (req: Request) => {
  const { messages } = payloadSchema.parse(await req.json());
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  return new Response(response.body);
});

declare const Deno: { serve(handler: (req: Request) => Promise<Response>): void };
