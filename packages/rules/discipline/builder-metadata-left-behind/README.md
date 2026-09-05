# `disc/builder-metadata-left-behind`

**The AI builder's scaffolding is still in the repo.**

A `lovable-tagger` devDependency, a `gptengineer.js` script tag in
`index.html`, v0's sync line in the README, a `package.json` still named
`my-v0-project`. None of it was chosen; all of it is what the generator
left behind.

## Why AI builders produce this

Because nothing removes it. A builder writes its own hooks into the tree so
its editor can round-trip changes, and the moment a project graduates —
cloned locally, deployed elsewhere, handed to someone else — those hooks
stop being infrastructure and start being litter. There is no step in any
of these workflows that says "you own this now, here is what to delete."

## What breaks in production

Modestly, and honestly: this is a `discipline`/`info` finding, weight 1.

- `gptengineer.js` is a **third-party script tag on every page load**,
  fetched from a CDN the project doesn't control. That one is a real, if
  small, supply-chain and privacy surface.
- `lovable-tagger` is a build-time dependency doing nothing outside the
  builder.
- A package still called `vite_react_shadcn_ts` is the name that shows up
  in lockfiles, Docker tags and error reports.

Mostly, though, it is a signal about ownership: nobody has yet read the
repo as *theirs*.

## What this rule is not

**It is not evidence that AI-generated code is worse.** It separates the
corpus's AI-generated repos from its controls perfectly (7/7 vs 0/6), and
that number means nothing, because the rule works by *reading the
generator's signature*. Citing it to show a repo is AI-generated and
therefore low-quality is circular — it is a provenance label wearing a
quality rule's clothes, and the composite score it feeds should be read
with that in mind. See
[DECISIONS/0030](../../../../DECISIONS/0030-two-false-positives-and-two-rules.md).

Two further limits, both structural:

- **Trivially defeated.** Deleting one README line silences it. It
  measures tidiness, not history.
- **Blind to any builder not in its marker list.** Today that list covers
  Lovable and v0, the two generators the corpus contains. bolt.new and
  Replit write their markers as *directories* (`.bolt/`, `.replit`) that a
  content-matching rule cannot see, and no corpus arm exists to calibrate
  them against — so they are absent rather than guessed at.

The rule matches only what a generator **writes into a tree**: a
dependency, a script tag, a generated sentence, a template package name. A
bare `lovable.dev` or `v0.app` URL is deliberately *not* a marker — a
README that links to a builder is not a repo built by one, and on the
corpus those URL markers add no discrimination at all, since all seven
AI-generated repos already carry a structural marker.

## Fix prompt

> This repo still contains scaffolding from the AI builder that created it.
> Remove what the project doesn't use:
>
> 1. **`index.html`** — delete any `<script>` tag loading `gptengineer.js`
>    (or any other builder script from a CDN). It runs on every page load
>    and is not part of your app.
> 2. **`package.json`** — remove the `lovable-tagger` devDependency and any
>    matching plugin entry in `vite.config.*`. Rename the package from
>    `vite_react_shadcn_ts` / `my-v0-project` to your project's actual
>    name.
> 3. **`README.md`** — delete the builder's auto-sync line and write what
>    the project is, how to run it, and what it needs configured.
> 4. Reinstall to refresh the lockfile, then confirm the app still builds
>    and runs.
>
> If you are still round-tripping through the builder, keep the hooks and
> do this when you stop.
