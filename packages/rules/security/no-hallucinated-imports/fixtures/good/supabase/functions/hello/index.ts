// Supabase Edge Functions run on Deno, which resolves imports by URL or by
// its own npm:/jsr: registry schemes — never against this repo's
// package.json (DECISIONS/0015).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() => new Response("ok"));
