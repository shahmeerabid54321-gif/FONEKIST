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

**The timeout.** The retry ladder in `lib/medusa.ts` was longer than the budget of the scope
it ran inside: eight seconds for the first attempt plus a forty-five second cold-start wake.
The two numbers were chosen in commits that never met. The wake landed while nothing was
prerendered, so no read ran inside a cache scope and the total did not matter; prerendering
landed assuming a read either succeeds or degrades. That is fixed by arithmetic and is not
what this record is about.

This section originally said the budget was "a hard fifty seconds that is not configurable".
Both halves were wrong, and the correction is recorded in the amendment at the end, because
believing it cost a third deploy.

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

## Amendment, after a third failed deploy

The fix above is sound and is not changed by what follows. It was incomplete, and one
sentence in it was false.

**The budget is configurable, and this project never had the one the code asserted.**
`experimental.useCacheTimeout` sets how long a fill may stall. When it is unset, Next derives
it from `staticPageGenerationTimeout` at ninety per cent. This project raised that setting to
180 seconds for the backend's sake, which silently made the fill budget 162 seconds. So the
constant asserting "a hard fifty second ceiling" was guarding a number that had never applied
here, and a stalled read sat for two minutes and forty-two seconds before failing the build.
The deploy log proves it: the gap between the last degradation warning and the failure is
161.9 seconds. `next.config.ts` now pins `useCacheTimeout` explicitly, next to the setting it
was silently inheriting from.

**A read that never settles cannot be caught.** `capture` catches what the read throws. A read
that hangs throws nothing, so the fill runs until Next's stall timer fires — and that timer
does more than abort the fill. It assigns the error to `workStore.invalidDynamicUsageError`,
which fails the page's prerender whether or not userland caught it. That is why the third
deploy logged `installments.cheapest failed; rendering without it`, showing
`degradeGracefully` working exactly as designed, and died anyway. Catching a
`UseCacheTimeoutError` is not a recovery; it only hides which read stalled.

**So a captured read now has a deadline.** `CACHE_READ_DEADLINE_MS` (45s) races every read
inside the scope, so a stall becomes a recorded failure rather than a hung fill, whatever
caused it — an unanswering socket, a starved event loop, or something inside the framework.
Three numbers now sit in a stated order, each asserted rather than assumed: the medusa ladder
(41s worst case, nested) finishes inside the deadline (45s), which fires well inside the
pinned fill timeout (60s), which is inside the page budget (180s). `lib/medusa.ts` throws at
import if the first of those stops being true.

What was not determined is *why* that particular read stalled past its own 8s and 25s abort
signals when the event loop was demonstrably healthy — Next's timer fired on schedule. The
deadline makes the cause moot rather than known, which is the honest description of it.

**And `/health` is not evidence the store works.** The same deploy showed liveness green and
`/store/product-categories` timing out at 25 seconds: Medusa answers `/health` as soon as the
HTTP server listens, before the modules have a warm database connection. `wait-for-backend.mjs`
now warms the store path itself, with the publishable key, which moves that first cold query
out of a budgeted cache fill and is also the only probe that can see a bad key — `/health`
does not take one, and Medusa rejects an unrecognised key with 400 rather than 401.
