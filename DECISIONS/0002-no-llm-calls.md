# ADR 0002 — No LLM API calls inside the tool

**Status:** accepted · **Date:** 2026-09-01

## Context
Generators (api docs, changelog, ux-review, context-optimize) could call an
LLM directly, or emit precision prompts for the user's own assistant.

## Options
1. Built-in LLM calls (BYO key or hosted)
2. Prompt-emission only: `gen` reads real code, writes pickcheck-prompt.md

## Decision
Option 2, permanently for core.

## Consequences
- Free forever, no keys, no accounts, no rate limits, no privacy questions —
  user code never leaves the machine
- Works identically with Claude, Cursor, Copilot, local models
- Trade-off: one extra paste step; mitigated by clipboard copy + clear output
- A future *optional* companion package may add direct calls; core never does
