// The try/catch is the point: supabase-js does not throw on a failed
// write, so this catch block never runs and the failure is still silent.
export async function announce(supabaseAdmin, communityId, content) {
  try {
    await supabaseAdmin.from("posts").insert({ community_id: communityId, content });
  } catch (error) {
    console.error("Failed to post announcement:", error);
  }
}
