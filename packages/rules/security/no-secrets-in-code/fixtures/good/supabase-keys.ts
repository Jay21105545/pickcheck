// Both Supabase key roles, and neither is this rule's business. Synthetic
// tokens: fake project ref, all-zero signature.
//
// The `anon` key is not a secret at all. Supabase ships it to every browser
// by design — it is the public half of the pair, and row-level security,
// not the key's secrecy, is what protects the data behind it. This rule's
// message tells you to *rotate* the value it found, which would be wrong
// advice here, at error severity, behind a composite gate.
export const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGVyZWZhYmNkZWZnaGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.0000000000000000000000000000000000000000000";

// The `service_role` key IS catastrophic — and it belongs to
// sec/hardcoded-service-role-key, which names the role, explains that it
// bypasses row-level security, and tells you to rotate it *now*. Matching it
// here as well would bill one defect to two error-severity rules, and the
// scorer's diminishing-returns curve (DECISIONS/0009) charges real points
// for the second. See DECISIONS/0033.
export const supabaseServiceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGVyZWZhYmNkZWZnaGlqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.0000000000000000000000000000000000000000000";
