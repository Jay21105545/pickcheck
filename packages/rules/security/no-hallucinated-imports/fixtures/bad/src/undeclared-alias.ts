// `@src/*` is a declared path alias in this project; `@lib/*` is not.
// Following `extends` must exempt the aliases a config actually declares,
// not everything that happens to be shaped like one — an undeclared
// `@scope/name` still resolves against the npm registry, which is the
// whole reason this rule has error severity.
import { track } from "@lib/telemetry-pro";

export function report(): void {
  track("event");
}
