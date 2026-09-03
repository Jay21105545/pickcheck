# Changesets

This directory contains changesets managed by
[`@changesets/cli`](https://github.com/changesets/changesets) — the tool
this repo uses to version and publish `pickcheck` (the CLI, `packages/cli`)
to npm.

Only `pickcheck` is versioned/published this way — the internal workspace
packages (`@pickcheck/rules`, `@pickcheck/report`, `@pickcheck/corpus`) are
listed in `.changeset/config.json`'s `ignore` and never get their own
release; they ship bundled inside `pickcheck`'s built `dist/`.

## Adding a changeset

After a user-facing change (a new rule, a CLI flag, a bug fix — anything
that should land in `pickcheck`'s published CHANGELOG):

```sh
pnpm changeset
```

Answer the prompts (which package — there's only one to pick — bump type,
and a summary). This writes a small markdown file into this directory;
commit it alongside your change. A PR can carry zero, one, or several
changesets.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the rest of this repo's PR
requirements, and the [changesets docs](https://github.com/changesets/changesets/tree/main/docs)
for the full command reference.
