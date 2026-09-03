# pickcheck

## 0.1.1

### Patch Changes

- Fix an uninstallable package. 0.1.0 declared the internal `@pickcheck/rules` and `@pickcheck/report` workspace packages as `dependencies` using pnpm's `workspace:^` protocol, which npm cannot resolve — `npx pickcheck` failed with `EUNSUPPORTEDPROTOCOL`. They are now `devDependencies`, bundled into `dist/` at build time. Three further shipping gaps found while fixing it are also resolved: `@pickcheck/rules` is now inlined by the bundler, and the rule.yaml files, `docs-kit/`, and `generators/` are now copied into `dist/` so they actually reach npm — without them a fixed install would have had zero rules and crashed `init`/`gen` with `ENOENT`. See DECISIONS/0021.

## 0.1.0

### Minor Changes

- Initial release: audit, init, and gen commands with 20 rules across six categories.
