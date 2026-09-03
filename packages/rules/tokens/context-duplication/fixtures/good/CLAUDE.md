# CLAUDE.md

## Hard constraints

This project never calls an LLM API directly from inside the tool itself — every generator only ever produces a prompt file that the user pastes into their own assistant of choice.

See AGENTS.md for the conventions agents specifically should follow.
