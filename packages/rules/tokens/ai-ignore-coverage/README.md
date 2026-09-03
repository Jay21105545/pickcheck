# Heavy/generated artifact not excluded from AI context

**Why AI does this:** `.gitignore` is the one ignore file every project
already has, so it's easy to assume it's the *only* one that matters —
but most AI coding tools index or attach files by walking the filesystem
directly, and many don't consult `.gitignore` at all (it answers "what
should git track," a different question from "what should an AI tool
read"). Nobody sets up a second, AI-specific ignore file unless they've
already been burned by an assistant chewing through a lockfile or a
build directory, which is exactly the failure this rule exists to catch
before it happens once.

**What breaks:** a multi-thousand-line `pnpm-lock.yaml`, a `node_modules`
tree, or a `dist`/`build`/`.next` output directory offers essentially zero
useful signal to an AI assistant and, if indexed or attached, burns a
large amount of context budget (or literal request cost, for tools that
charge per token) for nothing. In the worst case it crowds out the
actual source files that mattered for the task at hand.

**Detection:** `tokens` tier, `ignore-coverage` check (DECISIONS/0012).
Reads every candidate AI-ignore file that exists (`.cursorignore`,
`.claudeignore`, `.aiderignore`, `.codeiumignore`, `.windsurfignore`,
`.rooignore`) and combines them into one filter; for each heavy artifact
in `requiredPatterns` (lockfiles, `node_modules`, `dist`, `build`,
`.next`, `.turbo`, `coverage`) that's actually present on disk at the
repo root, flags it if no candidate ignore file covers it — including the
case where no AI-ignore file exists at all. This rule only runs on repos
with a tracked lockfile at the root (see this rule's `files`) — see
DECISIONS/0012 for why that's the applicability gate rather than the
artifacts themselves, which are normally git-ignored and so invisible to
the applicability check if used directly. Known limit, stated honestly:
artifact detection is repo-root-only — a monorepo package's own nested
`node_modules`/`dist` isn't independently checked, and this can't see
whatever proprietary indexing behavior a given AI tool actually has (some
respect `.gitignore` as a fallback even without a dedicated ignore file,
which this rule doesn't try to detect or credit).

## Fix prompt
> {{file}} exists in this repo but isn't excluded from AI-assistant
> context. Add (or extend) a `.cursorignore`/`.claudeignore`/equivalent
> file at the repo root covering lockfiles, `node_modules`, and any
> build/output directories, so AI tools don't waste context indexing
> generated content.
