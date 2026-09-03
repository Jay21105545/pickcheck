# Component fetches data but renders only the success branch

**Why AI does this:** a prompt like "show the list of users" describes the
happy path in full and says nothing about the other three states every
data-fetching component actually has (loading, error, empty). The
assistant writes `useEffect` + `fetch` + `.then(setData)` and a `.map()`
over the result, runs it once against a working API in the demo, sees a
populated list render, and stops — nothing in "fetch the users and show
them" signals that the fetch can also be slow, fail, or come back with
nothing.

**What breaks:** on first paint the fetched array is still its initial
value (usually `[]` or `undefined`), so the user sees a blank list with no
indication anything is happening — no spinner, no skeleton. If the
request fails, the component either renders nothing, throws trying to
`.map()` over `undefined`, or silently shows stale/empty data with no
error message. If the request *succeeds* with zero results, the user gets
the same blank space as a slow load or a failure, unable to tell "still
loading," "broke," and "there's genuinely nothing here" apart.

**Detection:** `regex` tier. Flags a `fetch(`, `axios.<method>(`,
`useQuery(`, or `useSWR(` call in a component file (`.tsx`/`.jsx`,
excluding test/fixture paths and API route handlers, which don't render
JSX) **unless** the same file contains any of a broad set of loading/
error/empty indicators anywhere — `loading`, `isLoading`, `pending`,
`skeleton`, `Spinner`, `Suspense`, `isError`, `error`, `catch`, `failed`,
`fallback`, `empty`, `EmptyState`, `no results` (case-insensitive).

This is deliberately the loosest possible reading of "handles the other
states": it doesn't verify a `loading` variable is actually used in the
JSX return, doesn't check that the `error` state is rendered anywhere,
and doesn't confirm an empty-array check guards the `.map()` — any one of
these words appearing *anywhere* in the file (a variable name, a prop, an
import) suppresses the finding entirely. That's intentional: this rule
exists to catch the "there is genuinely nothing here for any of the three
states" case — the signature AI failure — not to grade how *well* a
component handles them, which would need far more structural analysis
(and a much higher false-positive risk) than a regex tier can deliver
honestly. A component whose data-fetching logic lives in a separate
custom hook (`const { data } = useUsers()`) is out of scope entirely — no
`fetch(`/`useQuery(`/`useSWR(` call appears in the component file itself,
so nothing fires there; the hook's own file, if it's a `.ts` file rather
than `.tsx`/`.jsx`, isn't scanned by this rule either.

## Fix prompt
> The component at {{file}}:{{line}} fetches data but nothing in this
> file handles the loading, error, or empty state. Add: a loading
> indicator shown while the request is in flight, an error message shown
> if it fails, and an empty-state message shown if it succeeds with zero
> results — don't just render the success-path list unconditionally.
