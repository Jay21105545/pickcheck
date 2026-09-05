// The corpus shape: a multi-line write whose error is discarded, followed
// immediately by a success message the user has no reason to doubt.
export async function signIn(supabase, userId) {
  await supabase
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);

  toast.success("Welcome back!");
}
