import { supabase } from "@/integrations/supabase/client";

// Real shape from sports-on-the-go/src/hooks/useFriends.ts:218 — the
// terminal `.delete()` sits on its own line, which is what the regex tier
// (one line at a time) actually sees.
export function RemoveFriend({ friendshipId }: { friendshipId: string }) {
  async function handleRemove() {
    await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);
  }

  return <button onClick={handleRemove}>Remove friend</button>;
}
