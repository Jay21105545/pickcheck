// Bare local imports resolved via tsconfig's baseUrl (DECISIONS/0015),
// not npm packages — vercel/commerce and shadcn-ui/taxonomy both use this
// convention in place of (or alongside) "@/"-style aliases.
import type { SiteConfig } from "types";
import { site } from "config/site";

export function describeSite(config: SiteConfig = site): string {
  return config.name;
}
