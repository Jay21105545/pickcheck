---
"pickcheck": patch
---

Correct the README's corpus claim. The backtest corpus grew from 8 repos to
13 (DECISIONS/0029), adding the two cells it was missing — AI-generated
Next.js apps and professionally-built Vite/React SPAs — so that "separates
AI-generated from human-built" is no longer indistinguishable from
"separates Vite from Next.js". With those cells filled, the old claim that
every control repo scores above every AI-generated one is false, and the
README now shows the full 2x2 and names the overlap. No rule or engine
behaviour changed.
