# AI context file exceeds its token budget

**Why AI does this:** a `CLAUDE.md`/`AGENTS.md` file grows the same way
any living document does — every session that hits a new edge case adds
another paragraph of guidance, and nothing about adding one more section
ever feels like the thing that tips it over. Unlike source code, there's
no linter or bundle-size check flagging a context file's growth, so it
accretes silently across months of sessions until it's genuinely large.

**What breaks:** every AI coding session that reads this file spends part
of its context window doing so *before* looking at a single line of
actual code — a large context file is a fixed tax paid every time,
compounding across every session for the life of the project. Past a
certain size it also works against itself: important constraints get
buried among restated boilerplate, and a model is measurably more likely
to miss or deprioritize guidance near the middle of a long document than
guidance stated concisely near the top.

**Detection:** `tokens` tier, `budget` check (DECISIONS/0012). Counts
tokens (via `gpt-tokenizer`, lazy-loaded, entirely local — no network
call) in each matched context file and flags any file over 4,000 tokens.
That threshold is a starting point, not a precisely researched number —
different assistants have different effective context windows and
different sensitivity to document length, and a project with genuinely
complex conventions may need more than 4,000 tokens of honest guidance.
Treat this as "worth a look," not "this file is definitely wrong."

## Fix prompt
> {{file}} is over its token budget. Read through it for content that's
> restated elsewhere, guidance for edge cases rare enough to not need
> top-billing, or sections that could move into a linked doc the
> assistant only reads on demand — then trim it down to what actually
> needs to be in front of every single session.
