// The assign-then-assert shape: the code declares this key REQUIRED by
// throwing when it's unset, so it must be documented. Mirrors the real
// sports-on-the-go / mindtrack edge functions that read LOVABLE_API_KEY.
const NOTIFY_API_KEY = Deno.env.get("NOTIFY_API_KEY");

Deno.serve(async () => {
  if (!NOTIFY_API_KEY) {
    throw new Error("NOTIFY_API_KEY is not configured");
  }
  return new Response("ok");
});
