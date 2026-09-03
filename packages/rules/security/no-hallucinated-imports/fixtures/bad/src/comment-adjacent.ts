// This comment mentions "fake-package-name" but is just a comment — the
// real, live import below is the actual violation (DECISIONS/0015:
// comment-stripping must not swallow real code on an adjacent line).
import { thing } from "another-fake-package";

export function useThing(): unknown {
  return thing;
}
