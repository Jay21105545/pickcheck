// The recall gap DECISIONS/0033 closed: a credential passed *positionally*
// never touches a variable name, so the name-anchored branch
// (api_key|secret|token = "...") has nothing to anchor on. The JWT shape
// carries the finding instead.
//
// Every token in this repo's fixtures is synthetic — a fake issuer, a
// placeholder subject, and an all-zero signature. None of them authenticates
// anything.
import { createClient } from "./client.js";

export const api = createClient(
  "https://api.example.com",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuZXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImF1ZCI6ImV4YW1wbGUtYXBpIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjIwMDAwMDAwMDB9.0000000000000000000000000000000000000000000",
);
