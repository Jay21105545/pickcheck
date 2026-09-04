/**
 * The runtime check that runs before anything else is loaded — kept in
 * its own module so it can be unit-tested without executing the CLI, and
 * so `src/index.ts` stays short enough to audit at a glance.
 *
 * Everything here is deliberately dependency-free and written in syntax
 * that predates the floor it enforces: this code has to *run* on the
 * runtimes it exists to reject. `test/preflight.test.ts` asserts that
 * property mechanically, for this file and for the bin entry that calls
 * it. See DECISIONS/0025.
 */
import { readFileSync } from "node:fs";

export interface UnsupportedNodeVersion {
  /** The declared floor, verbatim from `engines.node` (e.g. ">=22.12.0"). */
  required: string;
  /** The running Node, verbatim from `process.version` (e.g. "v20.11.1"). */
  actual: string;
}

/** A `[major, minor, patch]` triple; missing segments read as 0. */
type Version = [number, number, number];

/**
 * Details of a failed version check, or `undefined` when the runtime
 * satisfies the floor.
 *
 * Also `undefined` whenever the floor can't be established — `engines` is
 * absent, isn't a string, or isn't a range we can read a lower bound out
 * of. A gate that can't tell what it's enforcing must let the user
 * through: blocking on a guess would turn a packaging slip into an
 * unrunnable CLI, which is strictly worse than the advisory `engines`
 * behaviour this backstops.
 */
export function unsupportedNodeVersion(
  actualVersion: string,
  enginesRange: unknown,
): UnsupportedNodeVersion | undefined {
  if (typeof enginesRange !== "string") {
    return undefined;
  }
  const required = parseVersion(enginesRange);
  const actual = parseVersion(actualVersion);
  if (required === undefined || actual === undefined) {
    return undefined;
  }
  if (!isOlder(actual, required)) {
    return undefined;
  }
  return { required: enginesRange, actual: actualVersion };
}

/**
 * `engines.node` out of the manifest at `packageJsonPath`, or `undefined`
 * if it's missing, unreadable or unparsable — read at runtime rather than
 * duplicated as a constant so the floor keeps exactly one source of
 * truth (DECISIONS/0024 already spreads it across six files; a seventh
 * copy that could drift from the one npm enforces is the last thing this
 * needs).
 */
export function readEnginesNode(packageJsonPath: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      engines?: { node?: unknown };
    };
    const node = parsed.engines?.node;
    return typeof node === "string" ? node : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The first `major[.minor[.patch]]` in a version string or range — enough
 * for `">=22.12.0"`, `"22.12.0"` and `"v20.11.1"` alike. A compound range
 * (`"^20 || >=22"`) yields its first bound, which is the conservative
 * read: the gate can only ever be laxer than intended, never stricter.
 */
function parseVersion(value: string): Version | undefined {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value);
  if (match === null) {
    return undefined;
  }
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function isOlder(actual: Version, required: Version): boolean {
  const [actualMajor, actualMinor, actualPatch] = actual;
  const [requiredMajor, requiredMinor, requiredPatch] = required;
  if (actualMajor !== requiredMajor) {
    return actualMajor < requiredMajor;
  }
  if (actualMinor !== requiredMinor) {
    return actualMinor < requiredMinor;
  }
  return actualPatch < requiredPatch;
}
