# Contributing to pickcheck

## Setup

```sh
pnpm install
```

This repo is pinned to Node 22 via `.nvmrc` (`nvm use`) — see
[ADR 0003](DECISIONS/0003-tsup-and-node22-toolchain.md) for why the CLI's
own build/dev tooling needs it even though the shipped CLI still targets
Node 22.12+ at runtime.

## Before opening a PR

```sh
pnpm typecheck
pnpm test
pnpm check
pnpm self-audit
```

All four must be green. If your change touches `packages/rules/` or
`packages/cli/src/engine/`, also run the corpus (below) and include its
diff in your PR description.

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, …).
- Record any non-obvious architectural choice — new dependency, new
  detection tier, scoring change, breaking CLI flag — in `DECISIONS/`
  (see `DECISIONS/0001-record-architecture-decisions.md`).
- Biome for lint/format (`pnpm check`) — never hand-format against it.

## Write a rule in 10 minutes

A rule is one folder, four pieces. No engine code, no PR review of
detection internals — just data and fixtures. Here's the whole loop,
worked through a real example: a rule that flags a stray `alert(...)`
call left in application code (`disc/no-alert`).

### 1. Folder anatomy (2 min)

```
packages/rules/discipline/no-alert/
├── rule.yaml
├── README.md
└── fixtures/
    ├── bad/
    │   └── src/example.ts     # MUST trigger the rule
    └── good/
        └── src/example.ts     # MUST NOT trigger the rule
```

The category directory (`discipline/`) is one of the six scored
categories (`security`, `quality`, `docs`, `discipline`, `ui-ux`,
`tokens`); the rule directory name (`no-alert/`) becomes the back half of
the rule's `id` — the front half is a short category prefix, matching
every existing rule's convention: `sec/`, `qual/`, `docs/`, `disc/`,
`ux/`, `tok/`.

### 2. `rule.yaml` (3 min)

```yaml
id: disc/no-alert
category: discipline
severity: warn
tier: regex
title: alert() left in source
files:
  - "**/*.{ts,tsx,js,jsx}"
  - "!**/*.test.*"
  - "!**/*.spec.*"
  - "!**/fixtures/**"
message: "alert() left in source — remove it or replace it with real UI feedback."
weight: 1
pattern:
  regex: "\\balert\\("
```

`tier` picks the detection engine: `exists` (a file present/absent),
`regex` (line-level pattern, used here), `astgrep` (structural — for
anything a regex would false-positive on: comments, strings,
formatting), `tokens` (budget/duplication via `gpt-tokenizer`), or
`manifest` (cross-referencing `package.json`). `weight` scales this
rule's contribution to its category's penalty relative to other rules in
the same category — read [ARCHITECTURE.md's Scoring
section](instruction/ARCHITECTURE.md) before picking anything other than
`1`. `severity` is `info`/`warn`/`error` — `error` in `security` is the
only one wired to a hard composite-score gate today.

### 3. `README.md` (3 min)

Every rule's README has the same three parts — see any existing rule
(e.g. [`packages/rules/quality/no-empty-catch/README.md`](packages/rules/quality/no-empty-catch/README.md))
for the shape: **why AI produces this mistake** (one paragraph — this is
what makes a rule worth writing, not just "this is bad practice"),
**what breaks in production**, and a **fix prompt** — the exact text a
user pastes into their own assistant. `rule.yaml`'s `message` is the
*live* fix-prompt text end users actually see (`findings.ts`'s
`buildFixPrompt()` builds it from `message`, not from the README) — the
README's fix-prompt section is where you draft and justify that wording,
not a separate document nobody reads.

### 4. Fixtures, both directions (2 min)

`fixtures/bad/` — minimal samples that **must** trigger:

```ts
// fixtures/bad/src/example.ts
function warnUser() {
  alert("Something went wrong");
}
```

`fixtures/good/` — near-miss samples that **must not** trigger. This
direction is mandatory, not optional polish — it's the false-positive
suite, and it's what stops a rule from being reverted three weeks after
merge:

```ts
// fixtures/good/src/example.ts
function alertUser(message: string) {
  console.warn(message);
}
```

Pick the near-miss deliberately: a `regex`-tier rule matches raw line
text, so it can't tell a real call from the same text inside a comment —
`// alert("...")` would still trigger `\balert\(` and make a bad "good"
fixture (that's exactly the kind of gap `astgrep` tier exists for — see
step 2). `alertUser(...)` is a genuine near-miss here because the pattern's
`\b` word boundary requires `alert` immediately followed by `(`, which
`alertUser(` never is.

### 5. Run it

```sh
pnpm test
```

The fixture harness (`packages/cli/test/rules/fixtures.test.ts`)
auto-discovers every rule folder under `packages/rules/` — no test file
to register, no import to add. It asserts `fixtures/bad` produces at
least one finding and `fixtures/good` produces zero, specifically for
your new rule.

That's the whole loop for an `exists`/`tokens`-tier rule. For `regex` or
`astgrep` (this example, and most real-world rules), there's one more
required step before it can merge — see below.

Fixtures prove a rule behaves as *designed* against synthetic samples.
They do not prove the design is *precise* against real code — a rule can
pass every fixture it was written to pass and still be wrong most of the
time in practice, which is exactly what happened to `ux/hardcoded-px-width`
before it was pulled (see
[DECISIONS/0014](DECISIONS/0014-ruleset-calibration.md)). That's what the
corpus is for.

### Required: run the corpus and include its diff

**Any rule addition, rule change (pattern, `files`, severity, weight), or
engine/tier change must be run against the backtest corpus, and the
resulting diff pasted into the PR description** — this is EXECUTION.md's
Stress-Test & Backtest Protocol, item 2 ("Corpus regression: engine/rule
changes re-run the corpus; any findings diff must be explained in the PR
description"), not optional polish.

```sh
pnpm corpus
```

Runs the built CLI against every repo in `corpus/repos.json` (pinned by
commit SHA — see its own comments for the control/ai-generated split) and
diffs the result against the committed snapshots in `corpus/snapshots/`.
No diff → exits 0, nothing to do. A diff → exits 1 and prints exactly
which findings were added/removed, grouped by repo and rule:

```
=== commerce (control) ===
  ux/input-missing-label: +0 -2
    - components/layout/navbar/search.tsx:15
    - components/layout/navbar/search.tsx:34
```

Review the diff:
- **Every removed finding should be one you recognize as a false positive
  you just fixed.** If a finding disappeared that you didn't intend to
  touch, your change is broader than you think.
- **Every added finding should be a real issue in real code**, not new
  noise. If a change adds findings on a well-regarded control repo (the
  four non-AI-generated repos in `corpus/repos.json`), that's the
  control-repo alarm from EXECUTION.md — treat it as a bug in the rule,
  not a finding, before shipping.

Once you've confirmed the diff is intentional, accept it as the new
baseline and commit the updated snapshot files:

```sh
pnpm corpus -- --update
```

Paste the diff output (from the plain `pnpm corpus` run, before
`--update`) into your PR description, with a sentence on why each line is
correct — the same discipline `qual/no-empty-catch`'s own README expects
of application code applies here: a change with no visible effect on
anything real isn't verified, it's just untested.

If you're adding a genuinely new false-positive pattern's fixture (per
the calibration workflow), add it to the relevant rule's `fixtures/good/`
*and* confirm the corpus diff doesn't regress — a rule that's precise
against its own fixtures but still wrong on the corpus means the fixture
doesn't actually capture the real pattern.

### Adding a repo to the corpus

Append to `corpus/repos.json`: `name`, `url`, a pinned `sha` (not a
branch — reproducibility requires an exact commit), `category`
(`"control"` for well-engineered reference repos, `"ai-generated"` for
repos actually produced by an AI tool, not merely AI-tool-friendly
boilerplate), and a one-line `note` on why it's there. Run `pnpm corpus
-- --update` to seed its baseline snapshot.

## Releasing (maintainers)

**Releases are automated. Do not run `npm publish` by hand.** Publishing
manually skips the validation gate, produces a build with no npm
provenance attestation, and lets the git tag, the CHANGELOG and the
registry drift apart. `pickcheck@0.1.0` and `0.1.1` were both published
by hand and both were broken on the registry — see DECISIONS/0021.

Only `pickcheck` (`packages/cli`) is ever published. The internal
workspace packages are `private: true` and are filtered out before
changesets even checks the registry, so they cannot be published by
accident.

### The flow

Two phases, driven by `.github/workflows/release.yml` on every push to
`main`:

1. **You describe the change.** After a user-facing change, run `pnpm
   changeset`, pick a bump type, write a summary, and commit the
   generated file in `.changeset/` with your PR. A PR can carry zero,
   one, or several.
2. **CI proposes the release.** When changesets are pending on `main`,
   the workflow opens (or updates) a **"Version Packages"** PR that
   applies the bumps and rewrites `packages/cli/CHANGELOG.md`. Nothing is
   published at this point.
3. **You merge that PR.** That lands a version bump on `main`, which runs
   the workflow again — now with no pending changesets — and it
   publishes to npm with provenance, then creates the GitHub release.

A push that changes no versions cannot publish. The publish path still
runs, but `changeset publish` asks the registry which versions exist and
only publishes ones that don't — so ordinary pushes are a no-op.

### One-time setup

Both are required before the first automated release:

- **`NPM_TOKEN` repository secret** — Settings → Secrets and variables →
  Actions → New repository secret. Use an npm **Granular Access Token**
  with *Read and write* on the `pickcheck` package (Automation-type
  classic tokens also work). It must bypass 2FA, which
  Granular/Automation tokens do and a Publish-type classic token does
  not.
- **"Allow GitHub Actions to create and approve pull requests"** —
  Settings → Actions → General → Workflow permissions. Off by default in
  many accounts; without it the Version Packages PR can't be opened.

### Verifying a release

The workflow writes a summary line saying whether it published, opened a
PR, or did nothing. After a publish, confirm the provenance badge appears
on the npm page — it's the signal that the OIDC attestation worked
(`id-token: write` plus `NPM_CONFIG_PROVENANCE`).

### If you must publish by hand

Only for bootstrapping a registry that automation can't reach yet.
Provenance is impossible here — it requires GitHub Actions' OIDC token,
which does not exist on a laptop — so the published build will carry no
attestation, and you should follow up with an automated release.

```sh
npm whoami                            # confirm auth
pnpm install --frozen-lockfile
pnpm typecheck && pnpm build && pnpm test && pnpm check && pnpm self-audit
pnpm changeset && pnpm run version    # note: `pnpm run version`, not `pnpm version`
git add -A && git commit -m "chore: version packages"
```

Then run the clean-install gate below, and only then `pnpm release` and
`git push --follow-tags`.

### Required before any publish: the clean-install gate

`npm pack --dry-run` lists what's *in* the tarball; it cannot tell you
whether that's *enough*. `pickcheck@0.1.0` passed it and was still
completely uninstallable (DECISIONS/0021). Every runtime path resolves
fine inside this pnpm workspace and can still be missing from a real
install, so the only trustworthy check is installing the tarball
somewhere the workspace can't rescue it:

```sh
pnpm --filter pickcheck run build
cd packages/cli && npm pack && cd ../..

# a temp dir OUTSIDE this repo — inside it, Node would resolve up into
# the monorepo's node_modules and hide exactly the bugs you're hunting
rm -rf /tmp/pickcheck-verify && mkdir -p /tmp/pickcheck-verify
cd /tmp/pickcheck-verify && npm init -y
npm install /path/to/pickcheck/packages/cli/pickcheck-<version>.tgz

printf 'node_modules/\n' > .gitignore
mkdir -p src && printf 'export function f(){try{g()}catch(e){}\nconsole.log(1)}\n' > src/app.ts
./node_modules/.bin/pickcheck audit --min 0     # must load all rules and report findings
./node_modules/.bin/pickcheck audit --min 0 --report
./node_modules/.bin/pickcheck init --yes        # must scaffold, not ENOENT
mkdir -p app/api/x && echo 'export async function GET(){return Response.json([])}' > app/api/x/route.ts
./node_modules/.bin/pickcheck gen api           # must find its shipped template
```

All four must succeed, and `audit` must report a non-zero rule count —
"0 rules" means the rule.yaml data didn't ship.
`packages/cli/test/publishable-package.test.ts` guards the static half of
this (no `workspace:` protocols, no unbundled `@pickcheck/*` imports,
data assets present in `dist/`) on every CI run.
