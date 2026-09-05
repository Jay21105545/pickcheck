// Local path aliases declared through an `extends` chain: `tsconfig.json`
// inherits `paths` from `tsconfig.extend.json`, exactly as
// buildship-ai/rowy does. Read one config file deep, `paths` is invisible
// and `@src/components/button` reads as an undeclared scoped npm package —
// 1,655 false positives on one control repo (DECISIONS/0030).
//
// A bundler rewrites both of these to local files; neither ever reaches
// the npm registry, so neither is a slopsquatting target.
import { Button } from "@src/components/button";
import { log } from "@root/shared/log";

export function render(): string {
  log("rendering");
  return Button();
}
