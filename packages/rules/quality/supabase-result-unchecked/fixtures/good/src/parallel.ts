// Real corpus near-miss: the query builders are array elements inside a
// Promise.all, indented exactly like a discarded statement would be, but
// each line begins with the client rather than with `await`.
export async function exportEverything(supabase, userId) {
  const [habits, water] = await Promise.all([
    supabase.from("habits").select("*").eq("user_id", userId),
    supabase.from("water_intake").select("*").eq("user_id", userId),
  ]);

  return { habits, water };
}
