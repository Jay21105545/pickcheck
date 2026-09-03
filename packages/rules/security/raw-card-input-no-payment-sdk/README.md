# Raw card input field with no payment SDK

**Why AI does this:** asked for "a checkout page" or "a payment form,"
an assistant generating from its training distribution reaches for the
most common web-form shape it has ever seen: a text input for the card
number, another for the expiry date, another for the CVC — because
that's what a checkout form has *looked like* in millions of tutorials,
blog posts, and screenshots it was trained on. Almost none of that
training data shows what's actually supposed to happen underneath: the
card number field is supposed to be rendered and owned entirely by a
payment processor's own iframe or hosted page, so the raw digits never
touch the surrounding application's code at all. The assistant
reproduces the *visual* shape of a card form — `<Input name="cardNumber">`,
a `cvc` field, an `expiry` field — as plain, ordinary form state, wires it
to a fake `setTimeout(...)` "processing" delay because there's no real
payment integration to call, and declares success. It looks completely
finished. Corpus review ([ADR 0018](../../../../DECISIONS/0018-raw-card-input-no-payment-sdk.md))
found exactly this shape, unmodified, in a real Lovable-generated
storefront's checkout page.

**What breaks — and why this is a PCI-DSS problem, not a UX one:** the
Payment Card Industry Data Security Standard (PCI-DSS) exists precisely
because "my own server/frontend touches the raw card number" is the
single riskiest thing an application can do with payment data. The
instant a `cardNumber`/`cvc`/`expiry` field is plain application state —
even if, today, the "Pay" button only calls `setTimeout` and never sends
anything anywhere — the code is one `fetch("/api/charge", {body:
checkoutInfo})` away from transmitting raw, unencrypted card numbers to a
server that was never designed, audited, or certified to receive them.
That single change is the *obvious*, *minimal* next step for whoever
"finishes" this feature (a human or another AI assistant), because
nothing about the code as written signals that it's wrong — the form
already validates, already has an `onSubmit`, already shows a success
state. A business that actually processes a card this way is exposed to
real fraud liability, cardholder-data-breach liability, and the loss of
its ability to accept cards at all if a processor discovers it. None of
this requires the current code to be "connected" to anything real yet —
the *shape* is the violation, because the shape is what gets copied
forward.

**Detection:** `manifest` tier, `requires-dependency` mode
(DECISIONS/0018) — a new discriminant alongside the tier's existing
`hallucinated-import` mode, since both need the identical ancestor-union
package.json resolution ([ADR 0007](../../../../DECISIONS/0007-manifest-tier.md)),
just to answer a different question. `pattern.regex` matches a `name=`,
`id=`, or `htmlFor=` attribute whose quoted value is exactly `cardNumber`,
`card_number`, `card-number`, `cvv`, `cvc`, `expiry`, or `expiration`
(case-insensitive) — an *exact* quoted-value match, not a substring, so
`name="cardNumberDisplay"` (a read-only masked display, not a capture
field) doesn't match. A match only becomes a finding if the file's
ancestor-union'd `package.json` dependencies (walking from the file's own
directory up to the scanned root — the same resolution
`sec/no-hallucinated-imports` uses) contain **none** of: `stripe`,
`@stripe/*`, `braintree`, `square`, `@paypal/*`, `adyen`, `razorpay`. An
entry ending in `/*` matches any package under that npm scope (so
`@stripe/react-stripe-js` and `@stripe/stripe-js` both satisfy
`@stripe/*`). Unlike `hallucinated-import`, a file with **no** ancestor
`package.json` at all still gets checked — the total absence of a
manifest is itself evidence no payment SDK is declared, not a reason to
skip the check.

**Known limits:**
- **Exact package names, not every real-world equivalent.** Braintree's
  actual client-side npm package is `braintree-web` (server SDK is
  `braintree`) — only the latter is in `requiresAnyOf` today. Square's Web
  Payments SDK and PayPal's classic Buttons SDK are both commonly loaded
  via a `<script>` tag from the provider's CDN rather than an npm package
  at all — this rule only inspects `package.json`, so a script-tag
  integration with no matching npm dependency would still fire even
  though the integration is real and compliant. Extend `requiresAnyOf` in
  `rule.yaml` (it's data, not code) as real gaps like this turn up — the
  same "revisit when a real sample proves it" discipline DECISIONS/0006
  and 0014 already established for other rules.
- **Attribute value must be a literal string.** `name={fieldName}` where
  `fieldName` is a variable set elsewhere to `"cardNumber"` isn't
  detected — the regex tier has no dataflow analysis, same documented
  limit as `qual/fetch-has-error-handling`'s `.ok`-anywhere-in-function
  heuristic.
- **A label alone, without a matching input, still fires.** The rule
  doesn't verify the `htmlFor`/`id`/`name` match are actually paired on
  the *same* logical field — three attributes on the same field (a
  `<Label htmlFor>` plus an `<Input id>` plus its `name`) produce three
  separate findings, not one. Deliberately not deduplicated: this mirrors
  how every other regex/manifest-tier rule in this ruleset counts matches
  (one per occurrence, not one per logical "thing"), and a form with more
  matching attributes is arguably a *stronger* signal, not noise to
  suppress.

## Fix prompt
> A form field at {{file}}:{{line}} is named or labeled like a raw card
> number, CVV, or expiry date, and no payment SDK is declared in this
> project. Do not add validation to this field — remove it. Replace the
> raw card inputs with a hosted, tokenized checkout: Stripe Checkout
> (redirect) or the Stripe Payment Element (embedded), or your payment
> provider's equivalent hosted/tokenized field. The card number, CVC, and
> expiry date should never exist as plain state in this application's own
> code — the payment provider's iframe or hosted page should be the only
> thing that ever sees them.
