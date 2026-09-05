# Submit handler resolves on a timer instead of a backend

**Why AI does this:** the prompt asks for a checkout page, a contact form,
a signup flow. The assistant can build every part of that except the one
part that needs infrastructure it doesn't have — a payment processor, a
mail service, a database. So it builds the whole interaction and stubs the
one hole in the middle, and the idiomatic stub for "a thing that takes a
moment" is a promise that resolves on a timer:

```ts
const handleSubmit = async (e) => {
  e.preventDefault();
  setIsSubmitting(true);

  // Simulate checkout process
  await new Promise((resolve) => setTimeout(resolve, 1500));

  setIsSubmitting(false);
  setIsCompleted(true);   // "Payment Successful!"
};
```

This is honest code when it's written — the comment says *simulate* — and
the assistant usually says so in chat too. The problem is what happens
next: it looks finished. The spinner spins, the button disables, the
success screen renders, the cart clears. There is no error, no TODO in the
build output, and no failing test. A flow that visibly works is the single
hardest kind of stub to remember to replace, and it ships.

**What breaks:** the user completes a checkout, sees "Payment
Successful!", and no payment exists. A contact form thanks them for a
message nobody received. A signup creates an account that isn't anywhere.
The card details in
[`shelfly-creator-hub`](../../../../corpus/repos.json)'s
`src/pages/CheckoutPage.tsx` — the motivating case, at line 45 — are
collected into React state by a form that then waits 1.5 seconds and
declares success; the number is never transmitted, which is the only good
news in this paragraph, and it's accidental.

**Detection:** regex tier, three clauses that all have to hold.

1. **Trigger:** an *awaited* artificial delay —
   `await new Promise(resolve => setTimeout(resolve, ms))`. This is the
   entire signal, and it is narrow on purpose. A timer that *schedules*
   work — debounce, throttle, an auto-dismissing toast, a delayed redirect
   — passes a callback and is never awaited. A timer that is awaited does
   nothing at all except make the next line happen later, which has no
   purpose in a file that never talks to a server other than imitating one.
2. **Precondition (`when`):** the file contains a submit-shaped handler
   (`handleSubmit`, `handleCheckoutSubmit`, `onSaveOrder`, …). The regex
   tier reads one line at a time and the handler is never on the trigger
   line, so this is what lets the rule mean what its title says.
3. **Suppression (`unless`):** the file shows no sign of a backend —
   no `fetch`, `axios`, `supabase`, `prisma`, `firebase`, GraphQL,
   WebSocket, or `"use server"`. An awaited delay *next to* a real network
   call is a retry backoff or a poll interval, which is ordinary code.

Clauses 2 and 3 both matter and the corpus cannot rank them: ungated, the
trigger runs at 50% (it picks up two retry-backoff sleeps in an Edge
Function), and either clause alone excludes those — an Edge Function has
neither a submit handler nor an absence of `fetch`. They are kept together
because they exclude different things.

**Known limits:**

- **Non-awaited fake flows are missed, deliberately.** The same corpus repo
  has two more: `ProductDetail.tsx:30` and `PricingPage.tsx:23`, both
  `handleCheckoutSubmit` handlers that set a success flag and use a plain
  `setTimeout` to reset the dialog. They are the same bug. Catching them
  means triggering on any `setTimeout` under these preconditions, and
  measured across the corpus that trade is +2 real findings, +1 duplicate
  of a file already flagged, and a trigger that a debounce or an
  optimistic-UI revert satisfies on its own. The recall cost is accepted
  and recorded in
  [ADR 0028](../../../../DECISIONS/0028-backend-coverage-rules.md);
  `fixtures/good/src/useDebouncedSave.ts` and
  `fixtures/good/src/OptimisticLike.tsx` are the shapes that make it a
  trade rather than a free win.
- **A named `sleep()` helper is missed.** `await sleep(1500)` is the same
  thing one indirection away, and this rule only knows the inline form.
- **"No network call in the file" is a proxy for "nothing left the
  browser", and it is imperfect in both directions.** A presentational
  form that hands its payload to an `onSubmit` prop, with the real request
  in the parent, would be flagged if it also contained an awaited delay —
  though the delay is what makes that combination unlikely. Conversely a
  file that imports an API client under some other name reads as
  networked and is skipped.
- Test files, stories, and `mocks/` directories are excluded by glob: a
  simulated backend is the correct thing to have there.

## Fix prompt

> In `{{file}}` at line {{line}}, a submit handler resolves by awaiting a
> `setTimeout` rather than by calling a backend, and this file makes no
> network request at all — so the success state it renders afterwards is
> reporting something that never happened.
>
> 1. Show me the whole handler and tell me exactly what a real
>    implementation would need: which service, which endpoint, and what it
>    returns.
> 2. Replace the awaited delay with that call. Keep the pending state that
>    the fake delay was driving — it now has a real duration to cover.
> 3. Make the success branch conditional on the call succeeding, and add
>    the failure branch that currently doesn't exist: a visible error, and
>    no clearing of the user's input or cart.
> 4. If this flow handles payment, do not implement it by posting card
>    details anywhere yourself — use the provider's hosted element or
>    redirect (Stripe Checkout, Payment Element, or the equivalent) so the
>    card number never reaches this app's code or state.
> 5. If the backend genuinely doesn't exist yet, say so and leave the
>    simulation in place, but make it visible: throw or render a clearly
>    marked placeholder state instead of "success", so nobody ships it by
>    mistake.
