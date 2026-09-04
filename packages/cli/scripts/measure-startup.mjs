#!/usr/bin/env node
// Measures the CLI's bin-entry startup cost against ARCHITECTURE.md's
// budget ("Bin entry imports < 50ms before command dispatch").
//
// Method: run `node dist/index.js --version` (the cheapest real command —
// it dispatches and exits without scanning anything) and subtract a
// `node -e ""` baseline measured in the same process/environment. The
// subtraction is what makes the number portable: it cancels out how fast
// the machine and this Node build happen to be, leaving pickcheck's own
// import cost.
//
// Both figures use the MINIMUM of N runs, not the mean. On a shared CI
// runner the mean is dominated by scheduling noise from neighbouring
// jobs; the minimum is the least-contended sample and is far more stable
// run-to-run. See DECISIONS/0022 for the variance measurements behind
// that choice and the headroom in the threshold.
//
// Usage: node scripts/measure-startup.mjs [--json] [--runs N] [--budget MS]
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(packageDir, "dist", "index.js");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const runs = Number(flagValue("--runs") ?? 7);
const budgetMs = Number(flagValue("--budget") ?? 50);

function flagValue(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function minDurationMs(nodeArgs) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i++) {
    const start = process.hrtime.bigint();
    const result = spawnSync(process.execPath, nodeArgs, { stdio: "ignore" });
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    if (result.status !== 0) {
      throw new Error(`${nodeArgs.join(" ")} exited with status ${result.status}`);
    }
    best = Math.min(best, elapsed);
  }
  return best;
}

const baselineMs = minDurationMs(["-e", ""]);
const totalMs = minDurationMs([entry, "--version"]);
const importMs = Math.max(0, totalMs - baselineMs);
const withinBudget = importMs < budgetMs;

if (asJson) {
  process.stdout.write(
    `${JSON.stringify({ baselineMs, totalMs, importMs, budgetMs, runs, withinBudget })}\n`,
  );
} else {
  const round = (n) => n.toFixed(1);
  process.stdout.write(
    `bin-entry startup (min of ${runs} runs)\n` +
      `  node baseline:   ${round(baselineMs)} ms\n` +
      `  pickcheck total: ${round(totalMs)} ms\n` +
      `  import cost:     ${round(importMs)} ms  (budget ${budgetMs} ms)\n` +
      `  ${withinBudget ? "PASS" : "FAIL — over ARCHITECTURE.md's bin-entry budget"}\n`,
  );
}

process.exit(withinBudget ? 0 : 1);
