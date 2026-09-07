// The correct shape: the service role is used, but the key is read from a
// server-only environment variable with no client-exposed prefix, and the
// name alone is not a finding. Only a key *value* in source, or a
// client-exposed *name*, is.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || serviceRoleKey === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, serviceRoleKey);
}
