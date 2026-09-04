# The pickcheck playbook

How engineering organizations of 100+ developers actually work — branching,
review, decision records, versioning, repo layout — and, at the end of each
chapter, **the solo/AI-builder version**: the fraction of the practice that
prevents real disasters without the ceremony that only pays off at scale.

These chapters stand alone. You don't need to install pickcheck to read
them; where a chapter names a template or a rule, it's because that piece
of the practice is one `npx pickcheck init` or one audit rule away.

| # | Chapter | The question it answers |
|---|---|---|
| 01 | [Branching](01-branching.md) | How long can work stay separated from `main` before merging becomes its own project? |
| 02 | [CODEOWNERS and reviews](02-codeowners-and-reviews.md) | What is review actually for, and what replaces it when there's no second human? |
| 03 | [ADRs and design docs](03-adrs-and-design-docs.md) | How does the reasoning behind a decision outlive the person — or the session — that made it? |
| 04 | [Versioning and changelogs](04-versioning-and-changelogs.md) | How does a consumer decide whether upgrading is safe? |
| 05 | [Monorepos](05-monorepos.md) | What does one repository buy, and what does it charge? |
