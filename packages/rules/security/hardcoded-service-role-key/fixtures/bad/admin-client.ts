// The literal key, positional — the shape sec/no-secrets-in-code could not
// see and this rule identifies by role. Synthetic token: fake project ref,
// all-zero signature, authenticates nothing.
import { createClient } from "@supabase/supabase-js";

export const admin = createClient(
  "https://examplerefabcdefghij.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGVyZWZhYmNkZWZnaGlqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.0000000000000000000000000000000000000000000",
);
