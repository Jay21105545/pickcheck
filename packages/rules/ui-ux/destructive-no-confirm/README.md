# Destructive action with no confirmation step

**Why AI does this:** "add a delete button" is usually read as a request
to wire up the delete *endpoint*, not to design the interaction around
the fact that deletion is irreversible — the assistant connects the
button's `onClick` straight to the DELETE call, tests it once against
data it doesn't mind losing, and the feature is "done" because the item
disappears exactly as asked.

**What breaks:** a misclick, a double-tap on mobile, or a user who didn't
realize what a button did permanently destroys data with no recovery
path — no undo, no trash, no second chance. Destructive actions are one
of the few places where a slower, more deliberate interaction is
*correct* UX, not friction to be optimized away, and it's exactly the
kind of judgment call ("this needs to be harder to trigger by accident")
that isn't visible from "add a delete button" alone.

**Detection:** `regex` tier. Flags four destructive shapes in a component
file, **unless** the same file also references a confirmation mechanism
anywhere — `confirm`, `window.confirm`, `useConfirm`, `ConfirmDialog`,
`AlertDialog`, `areYouSure`, `isConfirmOpen` (case-insensitive):

1. `axios.delete(`
2. a `fetch`/request options object with `method: "DELETE"`
3. **`.delete()` with empty parens** — a query-builder terminal delete
   (Supabase's `.from(t).delete()`, Firestore's `docRef.delete()`), plus
   `deleteDoc(`
4. a **Server Action** named `*delete*`/`*destroy*` bound via
   `action={…}` or `useActionState(…)`

Shapes 3 and 4 were added in [DECISIONS/0027](../../../../DECISIONS/0027-recall-drift-in-shipped-rules.md).
Before that this rule knew only the two HTTP shapes and matched **0 of the
17** real delete call sites in the backtest corpus, because AI-generated
apps delete through a database client, not `fetch`.

Two design constraints are load-bearing and should not be relaxed:

- **The empty parens in `.delete()` are the entire discriminator.** Every
  built-in `delete` takes an argument — `newSet.delete(id)`,
  `params.delete("q")`, `timeouts.delete(id)`, `cookies().delete('session')`
  — and a query-builder delete never does. Corpus-measured: 13 matches,
  all Supabase deletes; the 10 argument-taking `.delete(x)` calls in the
  same corpus are all harmless local collection edits and none matched.
  Widening this to `\.delete\(` reintroduces exactly the name-based
  heuristic the next paragraph rejects.
- **`remove` is deliberately not in the Server Action verb list.**
  `useActionState(removeItem, …)` in vercel/commerce is a shopping-cart
  line-item removal: routine, reversible, and not something to put a
  confirmation dialog in front of. `delete` and `destroy` are unambiguous;
  `remove` is not. This costs real recall — nextjs/saas-starter's
  remove-team-member form (`app/(dashboard)/dashboard/page.tsx:157`) has
  no confirmation and is not caught — and that trade is deliberate.

Still scoped to actual delete *operations*, never to function names like
`deleteFromCache`, for the same reason: a name-based heuristic false-positives
constantly.

**Known limits.** A confirmation step that lives in a *different* file (a
shared `<DeleteButton>` wrapper that already handles it) is invisible to
this file-scoped check and will be flagged anyway; conversely, one
`window.confirm` anywhere in a large file clears *every* delete in it,
which is why `sports-on-the-go/src/pages/Community.tsx`'s five deletes are
all silent. The `files` glob is `**/*.{tsx,jsx}`, so a delete extracted
into a `.ts` hook (`useFriends.ts`, `useSavedGames.ts`) is out of scope
entirely. And a *reversible* state change expressed as a row delete —
mindtrack's `HabitList.tsx:64` deletes a `habit_completions` row to
un-tick a checkbox — is indistinguishable from a real delete at this tier
and was the one measured false positive in the 0027 calibration. Ship
this as a warn and read its findings with that in mind.

## Fix prompt
> The delete action at {{file}}:{{line}} has no confirmation step before
> it runs. Add a confirmation — a native `window.confirm(...)` at minimum,
> or a proper confirmation dialog component — so a single accidental
> click can't permanently destroy data.
