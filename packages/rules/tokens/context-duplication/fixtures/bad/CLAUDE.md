# CLAUDE.md

## Hard constraints

This project never calls an LLM API directly from inside the tool itself — every generator only ever produces a prompt file that the user pastes into their own assistant of choice, and that constraint is never to be relaxed for convenience, speed, or any other reason no matter how small the feature seems.
