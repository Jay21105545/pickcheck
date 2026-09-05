// No script is *named* "typecheck", so a rule matching script names alone
// would call this project unchecked. `tsc &&` inside `build` is exactly how
// buildship-ai/rowy type-checks, and it fails the build on a type error —
// which is the whole question this rule asks.
export function greet(name: string): string {
  return `hello ${name}`;
}
