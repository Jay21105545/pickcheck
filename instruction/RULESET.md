# pickcheck — RULESET v0.1 (first 10 rules)

Spec Claude Code implements in Phase 1. Each rule = folder with rule.yaml,
README.md (incl. fix prompt), fixtures/bad, fixtures/good.

## 1. sec/no-secrets-in-code — error, regex
Patterns: `sk-[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, `ghp_[A-Za-z0-9]{36}`,
`(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}` in source files.
Scope: exclude fixtures, *.md, test files by default.
Good fixtures: `process.env.API_KEY`, key-like strings in comments/docs.

## 2. sec/no-env-in-git — error, exists
Trigger if `.env`, `.env.local`, `.env.production` are git-tracked
(`git ls-files` check, not mere presence).

## 3. sec/no-hallucinated-imports — error, regex+manifest
Parse import/require specifiers; flag bare specifiers absent from
package.json deps/devDeps (respect workspace + builtin + subpath rules).
Catches broken builds AND slopsquatting exposure.
Good fixtures: `node:fs`, type-only imports, workspace packages.

## 4. docs/changelog-exists — warn, exists
No CHANGELOG.md at root. Fix hint → `pickcheck gen changelog`.

## 5. docs/api-doc-exists — warn, exists (conditional)
Applies only if an API surface is detected (app/api/**, pages/api/**,
routes/**, fastapi/express markers). Missing API.md or openapi.* → finding.
Fix hint → `pickcheck gen api`.

## 6. docs/env-example-exists — warn, exists (conditional)
Applies only if code references `process.env.X` beyond NODE_ENV; then
`.env.example` must exist and mention those keys (coverage %, threshold 60%).

## 7. disc/no-console-log — warn, astgrep
`console.log($$$)` in src paths; exclude tests, scripts/, *.config.*.
Good fixtures: console.error in a logger module, tests.

## 8. qual/no-empty-catch — error, astgrep
catch clause whose block is empty or only a comment. The signature AI smell.
Good fixtures: catch with rethrow, catch with logging.

## 9. qual/fetch-has-error-handling — warn, astgrep
`await fetch(...)` where neither `.ok` check, try/catch wrapper, nor
`.catch` exists in the enclosing function. v1 heuristic: flag fetch calls
outside any try/catch that don't check response.ok.
Good fixtures: fetch inside try/catch; fetch with ok-check; wrapper util.

## 10. sec/post-has-validation — warn, regex v1 → astgrep v1.1
Route handlers reading `req.body` / `await request.json()` with no reference
to a validation lib (zod|yup|joi|valibot|class-validator) in the same file.
Honest about being a heuristic: severity warn, message says "no validation
detected", README explains limits.

## README Template per Rule

```
# <title>

**Why AI does this:** <the generation pattern that causes it>
**What breaks:** <production consequence>
**Detection:** <tier + pattern summary + known limits>

## Fix prompt
> <paste-ready prompt referencing {{file}} placeholders that the CLI fills
> with the user's real paths>
```

## Category Weights (initial — change only via decision record)
security .30 · quality .20 · docs .15 · discipline .15 · ui-ux .10 · tokens .10
(ui-ux and tokens rules land in Phase 3; weights present from day one so
scores are comparable across versions.)

## Parked rules

`ux/hardcoded-px-width` (Phase 3) is parked in `packages/rules/_incubating/`
— excluded from loading, not part of the shipped ruleset. A 4-repo
real-world calibration run (DECISIONS/0014) measured its regex tier at
18% precision, with three identifiable, compounding root causes. Its
README documents the findings and the recommended astgrep-tier rewrite;
resume it there rather than starting over.
