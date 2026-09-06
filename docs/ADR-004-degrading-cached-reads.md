# ADR-004: A cached read carries its failure instead of throwing it

**Status:** Accepted
**Date:** 2026-09-06
**Supersedes:** the CLAUDE.md rule "a fallback must never be computed inside a `use cache`
scope", which is restated here rather than removed.

## Context

Two production deploys failed with the same error:

```
Error: Filling a cache during prerender timed out, likely because request-specific
arguments such as params, searchParams, cookies() or dynamic data were used inside
"use cache".
```

The message is misleading. Nothing was reading request data inside a cache scope. Two
separate things were wrong, and only the first was obvious.

**The timeout.** Next fills a `use cache` entry under a hard fifty second budget that is not
configurable. The retry ladder in `lib/medusa.ts` took fifty-three: eight seconds for the
first attempt plus a forty-five second cold-start wake. The two numbers were chosen in
commits that never met. The wake landed while nothing was prerendered, so no read ran inside
a cache scope and the total did not matter; prerendering landed assuming a read either
succeeds or degrades. That is fixed by arithmetic and is not what this record is about.

**The real one.** A `use cache` fill that *throws* fails the prerender of whichever page
needed it. Not the component, the page. It does this however carefully the caller degrades.
With the backend unreachable, every `degradeGracefully` call ran, logged its warning, and
returned its fallback; the shell rendered exactly as designed; and the build died anyway. The
deploy logs were three minutes of correct degradation followed by a framework error naming
none of it.

This was verified rather than assumed, against a backend that answered `/health` and hung on
every store read:

- Wrapping the header and footer in `<Suspense>` changed nothing. Suspense catches
  suspension, not errors.
- `cacheLife("seconds")` on the failure path fails differently: a profile that short reads as
  dynamic during a blocking prerender, so the static routes fail with
  `blocking-prerender-dynamic`.
- Catching *inside* the scope was the only thing that let the build finish.

Which collided with the rule that forbade exactly that. The rule exists for a good reason: a
fallback computed inside the scope is a fallback *cached* by the scope, so one timeout is
stored as "this handset has no plans" and served to everyone for an hour. An empty plan list,
an empty result page and a 404 for a product that exists are all the site asserting something
untrue. That is a worse failure than a red build, and the rule was right to forbid it.

## Decision

**A cached read stores its failure as a value. It never stores a fallback, and it never
throws inside the scope.**

`lib/cached-read.ts` provides the pair:

- `capture(read)` runs inside the scope and returns a discriminated result. Success carries
  the value. Failure carries the original error's code, message and internal detail, reduced
  to plain JSON so an `Error` in a `cause` cannot make the entry unserialisable. A failed
  entry also drops to the `minutes` profile.
- `unwrap(result)` rebuilds the original `AppError` and throws it **outside** the scope,
  which is where the fallback belonged all along.

The consequence that matters: `{ ok: false }` means "the read failed". It never means "there
are none". Nothing false is ever written to the cache, and because `unwrap` throws the error
the caller was always going to see, every `degradeGracefully` call site behaves exactly as it
did before. The build survives because the fill completed. The customer sees what they saw
before because the error still reaches the same handler.

The rule therefore survives in the form that carried its meaning. It was never really "do not
catch inside the scope"; it was **"do not cache a fallback"**. Catching is how the fill
completes. Storing the failure is how nothing false is cached. Rethrowing outside is how the
fallback stays where it belongs.

Applied to the reads that can run during a static prerender: `getProductByHandle`,
`listCategories`, `getRegionId`, `fetchProductExtras`, `search` and `fetchPlans`.
`fetchLiveStock` and `fetchSuggestions` are deliberately untouched: both are already inside
dynamic boundaries, and stock in particular must keep its `seconds` profile, which this
would lengthen.

## Consequences

A deploy no longer depends on the backend being awake. Verified: with every store read
hanging forever, the build completes, generates all thirty static pages, and the route table
and prerender manifest are byte-identical to a healthy build.

What the customer gets during an outage is unchanged and honest. `/brands` renders "We could
not reach the catalogue. This is our end, not yours." `/phones` and `/search` leave their
results as streaming holes rather than baking in "no phones found". Checked against the
generated HTML: no false-empty claim appears anywhere in a fully degraded build.

An outage is cached for minutes rather than an hour. `seconds` would be better and is not
available for the reason above. `/api/revalidate` can still purge a tag early.

The cost is a layer of indirection: each of these reads is now a private cached function plus
a public unwrapping one. That is the price of the fill and the throw needing to happen in
different places.

`scripts/wait-for-backend.mjs` remains, for a different reason. It is no longer what keeps the
build alive, but it is still the difference between a legible deploy log and a baffling one,
and it wakes a sleeping instance once rather than fifty-eight times.
