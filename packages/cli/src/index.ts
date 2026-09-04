#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnginesNode, unsupportedNodeVersion } from "./preflight.js";

/**
 * The bin entry: a Node-version gate, and nothing else until it passes.
 *
 * `engines` is advisory — npm enforces it only when the user has
 * `engine-strict` set — so installing on an unsupported runtime succeeds
 * and the failure surfaces later, from inside whichever dependency first
 * uses syntax or an API the runtime lacks. DECISIONS/0024 raised the
 * floor to 22.12 (commander@15's own) and named that gap as deliberately
 * out of scope; DECISIONS/0025 closes it here.
 *
 * The CLI is loaded through `await import()` for one specific reason:
 * static imports are hoisted and fully evaluated before *any* of a
 * module's own statements run. A static `import { Command } from
 * "commander"` at the top of this file would therefore load — and can
 * crash — on exactly the runtimes this check exists to catch, before the
 * check could print a word. Deferring the import is what makes the gate
 * reachable at all; it is not a startup optimisation, and inlining
 * cli.ts back into this file would silently disable the feature.
 *
 * That leaves this file able to import only node: builtins old enough to
 * predate the floor, plus preflight.js, which holds itself to the same
 * bar. test/preflight.test.ts asserts both, on the source and on the
 * built bundle, so the guarantee can't erode by accident.
 */
const manifestPath = join(dirname(fileURLToPath(import.meta.url)), "../package.json");
const unsupported = unsupportedNodeVersion(
  process.version,
  readEnginesNode(manifestPath),
);

if (unsupported === undefined) {
  await import("./cli.js");
} else {
  // Setting exitCode and returning beats process.exit(1), which can
  // truncate a pipe write that hasn't flushed — the message is the entire
  // point of this branch.
  process.stderr.write(
    `pickcheck requires Node.js ${unsupported.required}, but this is Node.js ${unsupported.actual}.\n` +
      "Upgrade Node.js (https://nodejs.org) and run pickcheck again.\n",
  );
  process.exitCode = 1;
}
