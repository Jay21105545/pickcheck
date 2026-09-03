# AGENTS.md — broken-app

Guidance for agents working in this repo.

## Context

This project talks to a Stripe-shaped payment API and a lightweight in-memory user store, and every contributor is expected to keep the mock data in app/api/users/route.ts in sync with whatever the frontend components under components/ actually render, since there is no real backend behind any of this yet and the whole point of this repo is to give pickcheck something realistic-looking to audit.

## Style

Match the existing code style in each file you touch.
