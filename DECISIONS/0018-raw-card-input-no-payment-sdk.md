# ADR 0018 — `sec/raw-card-input-no-payment-sdk`, and the manifest tier's `requires-dependency` mode

**Status:** accepted · **Date:** 2026-09-03

## Context

Corpus separation analysis (the report preceding this record) read
`shelfly-creator-hub` — a Lovable-generated "digital-product storefront
with a checkout flow" that scores 80.42, above two real controls — end to
end. Its `CheckoutPage.tsx` has zero backend and zero payment SDK anywhere
in `package.json`, yet its form collects raw `cardNumber`/`expiry`/`cvc`
fields as plain component state, submits them to a handler that does
nothing but `await new Promise(resolve => setTimeout(resolve, 1500))`,
and unconditionally declares `"Payment Successful!"`. No existing rule
catches this. It's also not hypothetical or a one-off style choice: the
shape (raw card fields typed by hand into a form, no payment SDK
declared) is a genuine PCI-DSS exposure the moment anyone — human or
another AI assistant — takes the obvious next step of wiring the existing
`onSubmit` to a real endpoint, because nothing about the code as written
signals that doing so is dangerous.

## Decision

### The rule: `sec/raw-card-input-no-payment-sdk`

`category: security`, `severity: error`, `weight: 4` (same weight as
`sec/no-secrets-in-code` — both are about raw sensitive-data exposure, not
merely a missing best practice). Fires when a file has a `name=`, `id=`,
or `htmlFor=` attribute whose value is *exactly* (case-insensitive)
`cardNumber`, `card_number`, `card-number`, `cvv`, `cvc`, `expiry`, or
`expiration`, **and** the file's ancestor-union'd `package.json`
dependencies contain none of `stripe`, `@stripe/*`, `braintree`, `square`,
`@paypal/*`, `adyen`, `razorpay`. The rule's own README carries the PCI-DSS
reasoning in full (why this is a compliance problem today, not just a
future one) and its `message` — which, per `findings.ts`'s
`buildFixPrompt`, *is* the live fix-prompt text end users see, not the
README's separate "Fix prompt" section — explicitly says to replace the
fields with a hosted/tokenized checkout (Stripe Checkout, the Payment
Element, or the provider's equivalent), not to "add validation."

### The engine capability: manifest tier gains a `requires-dependency` mode

This detection needed something no existing tier shape provided: a
content-pattern match (regex tier territory) gated by the *absence* of
any of a small set of known dependencies, resolved via the exact same
ancestor-union `package.json` walk `sec/no-hallucinated-imports` already
uses (DECISIONS/0007) — not a single fixed manifest, so a monorepo
package inheriting a payment SDK declared only at the workspace root
isn't wrongly flagged, mirroring the existing tier's own tooling-config
test case. Per CLAUDE.md, this is new engine capability, not a rule
special case: `packages/rules/schema.ts`'s `manifestRuleSchema.pattern`
is now `z.discriminatedUnion("mode", [...])` with two members —
`hallucinated-import` (the existing behavior, now explicitly named
rather than implicit, since a single-shape `pattern` object couldn't
carry a second mode) and the new `requires-dependency` — the same
"discriminate the pattern payload, not the tier" move DECISIONS/0012
already made for the tokens tier. `sec/no-hallucinated-imports/rule.yaml`
gained `pattern.mode: hallucinated-import` as part of this change; no
behavior change, since it's the only rule that mode ever described.

`runManifestTier()` (`packages/cli/src/engine/tiers/manifest.ts`) is now
a dispatcher on `rule.pattern.mode`, same shape as `runTokensTier()`'s
dispatch on `pattern.check`. The existing hallucinated-import logic moved
into `runHallucinatedImportCheck()` unchanged; the new
`runRequiresDependencyCheck()` reuses the same `declaredDependenciesForFile()`
ancestor-walk (both pattern variants declare identical `manifestFile`/
`dependencyFields` fields, so the shared helper needs no changes) but
diverges in one deliberate way: **it does not skip a file with zero
declared dependencies anywhere up the ancestor chain.** For
hallucinated-import, "no manifest found at all" means there's nothing to
validate a specifier against, so skipping avoids flagging every bare
import as hallucinated in a non-Node project. For requires-dependency,
the opposite holds — a total absence of `package.json` *is itself*
evidence no payment SDK is declared, so it must not silently exempt the
file. A new `matchesAnyRequiredDependency()` helper resolves `@scope/*`
entries against the declared-name prefix (`@stripe/*` matches
`@stripe/react-stripe-js`, checked as `name.startsWith("@stripe/")`, not
a substring check, so `@stripeadjacent/tools` correctly does not match —
covered by its own fixture/unit-test case) and exact string matches for
every other entry.

### Fixtures

`fixtures/bad/` reproduces shelfly's real shape exactly (a `package.json`
with only `react`/`react-dom`, a `CheckoutPage.tsx` with `cardNumber`/
`expiry`/`cvc` fields). `fixtures/good/` covers the three cases specified
for this record: a Stripe **Payment Element** integration
(`StripePaymentForm.tsx` — no card-shaped field names at all, since
Stripe's own iframe owns every input), a Shopify-style **hosted checkout
redirect** (`ShopifyCheckoutButton.tsx` — proves the rule doesn't fire
merely because no payment SDK is declared; it only fires when a raw
card-shaped field is *also* present, which a redirect-only integration
never has), and a field **literally named `cardNumber`** inside a
component that legitimately imports a payment SDK
(`CardNumberField.tsx`, wrapping Stripe's classic `CardNumberElement` —
proves the rule isn't payment-SDK-blind).

## Consequences

- Verified against the real corpus: this fixes exactly the case it was
  built for. See the corpus re-run in this same change for the before/
  after numbers.
- `packages/rules/test/schema.test.ts` and
  `packages/cli/test/engine/tiers/manifest.test.ts` both gained cases for
  the new mode, including the two precision guards called out above (exact
  quoted-value match, not substring — `cardNumberDisplay` doesn't match;
  scope-prefix match, not substring — `@stripeadjacent/tools` doesn't
  satisfy `@stripe/*`).
- Known limits, stated in the rule's own README rather than repeated
  here: `requiresAnyOf` lists exact package names (misses `braintree-web`,
  Braintree's actual client-side package, and any CDN-`<script>`-loaded
  SDK with no npm dependency at all — Square's Web Payments SDK and
  PayPal's classic Buttons SDK are both commonly integrated exactly that
  way); the attribute-value match requires a literal string, not a
  variable reference. Both are extend-the-data-later gaps (`rule.yaml`'s
  `requiresAnyOf` list, or a future JSX-expression-aware astgrep rewrite),
  not blockers to shipping v1 — the same "ship the honest heuristic, note
  the gap, revisit when a real sample proves it" discipline this ruleset
  has followed throughout (ADR 0006, 0014).
- Rank-2 from the same separation analysis (a "simulated backend" check —
  `setTimeout`-only async resolution with no real `fetch`/API call in a
  submit handler) was explicitly **not** built here — it needs its own
  corpus-calibration pass first, the same protocol every other rule in
  this ruleset went through before shipping.
