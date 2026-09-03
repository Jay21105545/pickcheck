// "fetch-retry-pro" reads like a real npm package — it isn't. Neither
// installed nor published; a plausible name an assistant generated while
// writing retry logic from memory instead of checking what's available.
import { retryRequest } from "fetch-retry-pro";

export async function loadUsers(): Promise<unknown> {
  return retryRequest("/api/users");
}
