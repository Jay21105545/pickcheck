# Generate a CHANGELOG entry — {{PROJECT_NAME}}

Paste this into your AI assistant. Below are {{COMMIT_COUNT}} commits
(since the last tag, or the most recent ones if there's no tag yet),
grouped by conventional-commit type. pickcheck made no network or LLM
calls to produce this — it only read local git history.

## Task

Write a new entry for the top of `CHANGELOG.md`, formatted per
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

- Use `## [Unreleased]` as the heading unless told the next version number.
- Group items under `### Added`, `### Changed`, `### Fixed`, `### Removed`
  as appropriate — not the raw commit types below.
- Rewrite each commit subject into a user-facing sentence. Drop anything
  purely internal (test-only changes, CI tweaks) unless it affects
  contributors.
- Keep entries terse — one line each, no marketing language.

## Commits by type

{{COMMIT_GROUPS}}
