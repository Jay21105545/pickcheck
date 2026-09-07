// The anon key, hardcoded — and deliberately NOT a finding for this rule.
// It is public by design: Supabase ships it in every browser bundle, and
// row-level security, not the key's secrecy, is what protects the data.
// Its payload encodes `"role":"anon"`, a different run of base64 to any of
// this rule's three service-role literals.
//
// sec/no-secrets-in-code does not claim it either — its JWT branch excludes
// Supabase-issued tokens outright. See DECISIONS/0033.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://examplerefabcdefghij.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGVyZWZhYmNkZWZnaGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.0000000000000000000000000000000000000000000",
);
