# Generate API.md — {{PROJECT_NAME}} ({{FRAMEWORK}})

Paste this into your AI assistant. It embeds the real route code found in
this repo below — pickcheck made no network or LLM calls to produce it, it
only read local files.

## Task

Write `API.md` documenting every endpoint found in the
{{ROUTE_COUNT}} file(s) below:

- HTTP method and path (infer the path from the file's location if the
  framework uses file-based routing).
- Request shape: params, query string, body — and whether a validation
  library actually enforces it.
- Response shape and status codes, including error responses.
- Auth requirements, if visible in the code.
- Be factual: document what the code actually does, not what you'd expect
  a route like this to do. If something is ambiguous, say so instead of
  guessing.

## Routes

{{ROUTES}}
