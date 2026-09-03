import { useUserProfile } from "../hooks/use-user-profile";

// Data-fetching lives entirely inside the custom hook, out of this
// file's scope — nothing in this component calls a data source directly.
export function Profile({ userId }: { userId: string }) {
  const { data } = useUserProfile(userId);
  return <div>{data?.name}</div>;
}
