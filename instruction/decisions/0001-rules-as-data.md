# ADR 0001 — Rules are data, not code

**Status:** accepted · **Date:** 2026-09-01

## Context
pickcheck's value scales with rule count and community contribution. If each
rule is hand-written engine code (AST visitors), contribution requires
parser expertise and PRs bottleneck on maintainers.

## Options
1. Rules as TS modules implementing an interface
2. Rules as YAML data validated by zod, executed by tiered engine
   (exists | regex | astgrep | tokens)

## Decision
Option 2. ast-grep's YAML structural patterns align exactly with this model
and provide Rust-speed multi-language matching without per-rule code.

## Consequences
- Contributors write patterns + fixtures, never engine code
- Rule folders double as published docs (rules/ is the CMS)
- Engine capability grows only by adding tiers (each tier = decision record)
- Some complex heuristics ship as honest warn-severity approximations first
