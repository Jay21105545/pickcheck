// Same key, a 19-character project ref. The shorter ref shifts `"role"` to a
// different byte offset, so it encodes to a different run of base64 — which
// is why the rule carries all three alignments rather than one literal.
// Synthetic token.
export const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGVyZWZhYmNkZWZnaGkiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjIwMDAwMDAwMDB9.0000000000000000000000000000000000000000000";
