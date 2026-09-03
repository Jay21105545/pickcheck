# Duplicated content across AI context files

**Why AI does this:** a repo accumulates more than one context file over
time — `CLAUDE.md` for Claude Code, `.cursorrules` or `.cursor/rules/`
for Cursor, `AGENTS.md` for a different tool, each set up in a separate
session, sometimes by asking an assistant to "copy the same conventions
into a Cursor rules file." The easiest way to satisfy that request is to
paste the existing content across, which is correct once and stale
forever after: the next edit to one file has no mechanism to propagate to
the other.

**What breaks:** every AI tool that reads more than one of these files
(or a human skimming both to understand project conventions) pays the
token cost of the same guidance twice for no benefit. Worse than the
waste itself: the two copies inevitably drift. A rule gets updated in
`CLAUDE.md` after a real incident but the identical paragraph in
`.cursorrules` doesn't get the same edit, and now different AI tools
working on the same repo are operating from silently different — and
sometimes contradictory — instructions.

**Detection:** `tokens` tier, `duplicate` check (DECISIONS/0012). Splits
each matched context file into blank-line-delimited paragraphs, keeps
paragraphs at or above 200 characters (short paragraphs — a heading, a
one-line note — coincide across files constantly without anything having
actually been copy-pasted), and compares every pair of matched files:
a paragraph appearing verbatim (whitespace-normalized) in two different
files is a finding, reported against the first file at the paragraph's
line, naming which other file and line it's duplicated from. Only the
*first* shared paragraph per file pair is reported, not every one — this
is meant as a "these two files have drifted apart, go look" signal, not
a full diff. Needs at least two matched context files to compare at all,
so a repo with a single `CLAUDE.md` and nothing else is silently fine.
Known limit: this only catches genuinely verbatim (modulo whitespace)
duplication — content that says the same thing in different words, or
that was duplicated and has since partially diverged, won't match.

## Fix prompt
> The paragraph at {{file}}:{{line}} is duplicated verbatim in another
> context file. Pick one file as the source of truth for this guidance
> and have the other reference or link to it instead of repeating it, so
> a future edit only has to happen in one place.
