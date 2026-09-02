# CHANGELOG.md missing

**Why AI does this:** a changelog isn't code — nothing about the feature
the assistant was asked to build requires one, and no test fails without
it. It's the kind of process artifact a 100-person org enforces by review
policy, not something that falls out of "implement X."

**What breaks:** nothing at the moment it's missing, and that's exactly
the problem — the cost shows up later, when a user upgrading the package
or a collaborator picking the repo back up after a month has no record of
what changed between versions and has to read commit history (or worse,
diff the whole repo) to find out.

**Detection:** exists tier — a finding fires if no `CHANGELOG.md` is
present at the repo root. No conditionality: every repo benefits from a
changelog, unlike the API-docs rule below which only applies once an API
surface exists.

## Fix prompt
> Create `CHANGELOG.md` at the repo root using the Keep a Changelog format
> (`## [Unreleased]` section, `### Added` / `### Changed` / `### Fixed`
> subsections). Run `pickcheck gen changelog` if available, or seed it by
> summarizing `git log --oneline` grouped by conventional-commit type.
