---
"pickcheck": patch
---

Stop flagging real dependencies as hallucinated imports when auditing a
subdirectory of a monorepo.

`cd packages/cli && pickcheck audit` reported `tsup.config.ts`'s
`import { defineConfig } from "tsup"` as a hallucinated import, because
`tsup` is declared in the monorepo root's package.json and manifest
resolution stopped at the scan root. It now continues above the scan
root, bounded both ways: it doesn't start if the scan root is itself a
project root, it stops inclusively at the first project root above
(`.git`, `pnpm-workspace.yaml`, or `package.json#workspaces`), and it
contributes nothing if none is found. Only manifests are read up there —
no file above the scan root is scanned or reported on. See
DECISIONS/0026.
