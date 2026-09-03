import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  clean: true,
  dts: false,
  // @pickcheck/report ships as bare .ts source (no build step of its own,
  // same as @pickcheck/rules — see DECISIONS/0019), with internal
  // relative imports using NodeNext's required `.js`-suffixed specifiers
  // for a sibling `.ts` file (e.g. render.ts's `from "./palette.js"`).
  // esbuild's bundler resolves that convention correctly when it inlines
  // the source at build time; left external (tsup's default for anything
  // in package.json `dependencies`), those specifiers instead have to be
  // resolved by Node's own runtime loader at import time, which has no
  // such mapping and throws ERR_MODULE_NOT_FOUND the moment a `--report`
  // run reaches the dynamic `import("../render/html.js")` in
  // commands/audit.ts. Force-bundling avoids ever loading @pickcheck/
  // report's raw .ts files at runtime at all.
  noExternal: ["@pickcheck/report"],
});
