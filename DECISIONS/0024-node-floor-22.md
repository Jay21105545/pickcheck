# ADR 0024 — Raise the Node floor to 22.12, rather than pinning dependencies back to reach Node 18

**Status:** accepted · **Date:** 2026-09-04

**Supersedes** CLAUDE.md's "Node 18+ compatibility" hard constraint and
the runtime half of [ADR 0003](0003-tsup-and-node22-toolchain.md) (whose
toolchain-vs-runtime split still stands; only the runtime floor moves).

## Context

Installing `pickcheck` on Node 20 printed a wall of `EBADENGINE`
warnings before the tool ran. Measured, our dependencies require:

| dependency | engines.node |
|---|---|
| `commander@15` | **>= 22.12.0** |
| `@clack/prompts@1.7` | **>= 20.12.0** |
| `@ast-grep/napi`, `fast-glob`, `yaml`, `ignore`, `micromatch` | ≤ 14 |
| `gpt-tokenizer`, `picocolors` | none |

Meanwhile both `package.json`s declared `engines.node: ">=18"`. That
declaration was simply false — we shipped a dependency that needs 22.12
while telling users 18 was fine. The wall of yellow was npm correctly
reporting a contradiction we had introduced.

Two ways out: pin dependencies back to reach Node 18 (`commander@13` is
the last major supporting it; `@clack/prompts` would need an older major
too), or raise the floor to match what we actually ship.

## Decision

**Raise the floor to `>=22.12.0`** — matching `commander@15`, the
strictest dependency — rather than downgrading dependencies.

Reasoning:

1. **Node 18 and 20 are both past end-of-life.** 18 ended April 2025, 20
   ended April 2026. Neither receives security patches. A tool whose
   entire premise is auditing a repo's security and discipline posture
   should not ask users to run an unpatched runtime to do it.
2. **We never tested Node 18 anyway.** `.nvmrc` pins 22.22.0 and CI runs
   only Node 22 — so "Node 18+ support" was an untested claim. Claiming
   support we don't exercise is worse than dropping it honestly.
3. **The alternative ships deliberately older dependencies** to keep two
   EOL runtimes alive. That trade only makes sense if a meaningful number
   of users are stuck on an EOL Node, which is not a population a pre-1.0
   tool should optimise for at the cost of its own currency.
4. **22.12 is a real boundary, not a guess** — it's `commander@15`'s
   floor. Picking anything lower would leave the declaration false again,
   which is the exact bug being fixed.

`tsup`'s build target moves `node18` → `node22` to match, so output is no
longer downlevelled for a runtime we don't support.

### What this does and does not fix

Measured against the real tarball on both runtimes:

- **Node 22.22**: `added 32 packages` — **zero** EBADENGINE warnings.
- **Node 20.11**: warnings remain, because they come from the
  dependencies' own `engines`, which our declaration cannot suppress.

So this does **not** silence the warnings for someone on Node 20 — only
downgrading dependencies would, and that's the trade we're declining.
What it does fix is coherence: the first line now reads
`pickcheck required: >=22.12.0`, telling the user precisely what's wrong,
instead of pickcheck claiming `>=18` while its own dependencies said
otherwise. Anyone on a supported Node sees nothing at all.

`engines` is advisory unless the user sets `engine-strict`, so a Node 20
install still proceeds; it may then fail inside `commander`. A friendly
runtime version check in the bin entry would turn that into a clear
message and is worth considering, but is deliberately out of scope here.

## Consequences

- CLAUDE.md's hard-constraint list, `README.md`, `CONTRIBUTING.md`,
  `instruction/EXECUTION.md`, both `package.json` `engines` fields, and
  `tsup.config.ts`'s target all updated together — the floor is stated in
  six places and a partial update would recreate the same contradiction.
- Users on Node 18/20 must upgrade. For a pre-1.0 CLI whose install was
  already emitting warnings on those versions, this is the honest break.
- Revisit if `commander` ever relaxes its floor, or if usage data shows a
  real population pinned to an EOL Node — the decision is a trade against
  today's dependency reality, not a permanent stance.
