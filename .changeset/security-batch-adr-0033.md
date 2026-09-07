---
"pickcheck": minor
---

Add three security rules and close a recall gap in a fourth (ADR 0033).

**New rules**

- `sec/hardcoded-service-role-key` (error) — a Supabase service-role key
  exposed in source, either as a key literal or read from a client-exposed
  env prefix (`NEXT_PUBLIC_`/`VITE_`/`REACT_APP_`/`EXPO_PUBLIC_`). The
  literal is identified by role without decoding it, so the `anon` key —
  which is public by design — is never flagged.
- `sec/admin-route-no-auth` (error) — an exported HTTP handler in a route
  file under both an `api` and an `admin` path segment, in a file
  containing no authorization check of any kind.
- `sec/weak-default-credential` (error) — a password-shaped identifier
  assigned a known-weak literal (`password123`, `admin123`, `changeme`,
  `123456`, …). Seed scripts reachable through a `package.json` script are
  exempt.

**Fixed**

- `sec/no-secrets-in-code` missed any credential passed *positionally* —
  `createClient(url, "eyJ...")` — because its only name-independent
  branches required a vendor prefix. It now also matches a JWT by shape.

Corpus: 24 new findings across 2 of 13 repos, 0 on any control,
hand-classified at 22 true positives / 1 false positive / 1 arguable.
