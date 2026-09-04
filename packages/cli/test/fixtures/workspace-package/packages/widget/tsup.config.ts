// The whole point of this fixture: `tsup` is declared at the workspace
// root, never in this package. Auditing from the repo root resolved it
// fine; auditing from inside this package used to flag it as a
// hallucinated import, because resolution bottomed out at the scan root.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
});
