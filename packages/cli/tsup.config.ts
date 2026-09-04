import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  dts: false,
  // Both workspace packages ship as bare .ts source with no build step of
  // their own (DECISIONS/0019, DECISIONS/0021) and MUST be inlined here:
  // they are devDependencies, so a consumer who installs `pickcheck` from
  // npm never gets them on disk at all. Anything left external here is a
  // module-not-found crash for every real user, which is exactly how
  // 0.1.0 shipped broken — @pickcheck/rules was missing from this list
  // while its imports (`@pickcheck/rules/schema`, and a
  // `require.resolve("@pickcheck/rules/package.json")` in audit.ts)
  // survived into dist/. It never surfaced in local testing because every
  // test ran inside this pnpm workspace, where those specifiers resolve
  // via the workspace symlinks a published install doesn't have.
  //
  // esbuild also resolves NodeNext's required `.js`-suffixed specifiers
  // for sibling `.ts` files (e.g. report's `render.ts` importing
  // "./palette.js") correctly when inlining, which Node's own runtime
  // loader does not — a second reason these can never be left external.
  noExternal: ["@pickcheck/report", "@pickcheck/rules"],
});
