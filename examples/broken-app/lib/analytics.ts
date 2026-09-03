import { track } from "posthog-node-lite";

export function trackSignup(userId: string): void {
  track("signup", { userId });
}
