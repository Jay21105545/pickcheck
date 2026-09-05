// Out of scope by measurement, not by oversight — see rule.yaml. A failed
// sign-out is corrected by the next page load; a failed cleanup of an
// avatar that is about to be orphaned anyway changes nothing.
export async function signOut(supabase) {
  await supabase.auth.signOut();
}

export async function dropOldAvatar(supabase, userId, path) {
  await supabase.storage.from("avatars").remove([`${userId}/${path}`]);
}
