import micromatch from "micromatch";

/**
 * Whether any file in `list` matches `patterns`, where `patterns` may
 * include `!`-negated exclusions (e.g. `["**\/.env", "!**\/fixtures/**"]`).
 *
 * Deliberately NOT `micromatch.some()`: that helper tests each pattern in
 * `patterns` as its own independent standalone matcher and ORs the
 * results — so a negated pattern by itself matches almost every file (a
 * file "matches" `!**\/fixtures/**` simply by not being under fixtures/),
 * making `.some()` return true for nearly any non-empty list the moment a
 * negation is present, regardless of whether the positive patterns
 * actually matched anything. `micromatch()`'s plain filter form computes
 * positive matches and then subtracts negated ones correctly; this just
 * checks that filtered result for non-emptiness. See DECISIONS/0006.
 *
 * `dot: true` throughout — scannedFiles includes dotfiles (see scan.ts),
 * and without it micromatch's `**` won't match a dotfile segment, either
 * as a positive match or under a `!` exclusion pattern.
 */
export function matchesAnyGlob(list: string[], patterns: string[]): boolean {
  return micromatch(list, patterns, { dot: true }).length > 0;
}
