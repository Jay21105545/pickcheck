// Single-line insert, result discarded.
export async function notify(supabase, userId, title) {
  await supabase.from("notifications").insert({ user_id: userId, title });
}

// An RPC is the same story: it resolves with { data, error } too.
export async function sweep(supabase) {
  await supabase.rpc("clean_old_rate_limits");
}
