// Destructured and acted on — the shape the rule wants people to reach.
export async function updateProfile(supabase, userId, values) {
  const { error } = await supabase.from("profiles").update(values).eq("id", userId);
  if (error) {
    throw error;
  }
}

// Multi-line, destructured. The binding is on the first line, so the
// statement does not start with `await`.
export async function loadProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();

  return { data, error };
}

// Kept whole, then inspected.
export async function insertRow(supabase, row) {
  const result = await supabase.from("rows").insert(row);
  if (result.error) {
    throw result.error;
  }
}

// Handed to the caller, whose job the check becomes.
export async function deleteRow(supabase, id) {
  return await supabase.from("rows").delete().eq("id", id);
}
