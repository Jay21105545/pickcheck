export const DEFAULT_MIN_SCORE = 60;

/** ARCHITECTURE.md's pipeline: exit 0 if composite >= minScore, else 1. */
export function getExitCode(composite: number, min: number = DEFAULT_MIN_SCORE): 0 | 1 {
  return composite >= min ? 0 : 1;
}
