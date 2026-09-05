# FONEKIST

Phone-only Pakistani storefront, running on the shared Medusa commerce backend in the
sibling `WEBSITE DESIGN` monorepo.

## What is built

Workstream 0 of the plan: the app scaffold, the shared-contract vendoring mechanism, the
design tokens, the catalog read layer, and a home page that renders the live catalog. The
phone-only boundary is enforced and tested end to end.

The storefront sells on installments only. There is no cart and no checkout: nothing is bought on the site.

## Running it

The commerce backend must be running first:

```bash
cd "../WEBSITE DESIGN"
pnpm --filter commerce seed     # prints both publishable keys
pnpm --filter commerce dev      # :9000
```

Then:

```bash
cp .env.example .env.local      # set the key labelled FONEKIST, not Storefront
pnpm install
pnpm dev                        # :3001
```

### Product images in local development

Nothing to configure. Leave `NEXT_PUBLIC_MEDIA_BASE_URL` empty and run `pnpm sync:media`,
which copies the seed's imagery into this repository's own `public/media`. The paths then
resolve against this origin.

This used to say to point the variable at `http://localhost:3000` and run the other
storefront alongside, which meant FONEKIST loaded its photographs from a second shop that
merely happened to be on the same machine. In production the variable points at a CDN
instead (ADR-012 upstream). See `src/lib/media.ts`.

Those images are stand-ins, not photographs of the stock being sold, and must not ship.

## The phone-only rule

Nothing in this repository filters for phones, and nothing should. Every request carries the
FONEKIST publishable key, which resolves to the FONEKIST sales channel, and that channel
contains only phones (ADR-022 upstream). A category filter here would be a second, weaker
copy of that rule, and the two would eventually disagree.

The consequence is that the rule cannot be verified by reading this code. It is verified by
`tests/e2e/catalog-boundary.spec.ts` against a running backend. That test fails if the wrong
publishable key is configured or if a non-phone is assigned to the channel, which are the
two ways it actually breaks.

## Shared contracts

`src/lib/pk/` is generated from `@pk/contracts` upstream by `pnpm sync:contracts`. Do not
edit it. Edit upstream and re-sync.

FONEKIST is a separate repository, so it cannot use `workspace:*`. Vendoring keeps one
author for the rules both systems must agree on, and `src/lib/pk/drift.test.ts` fails when
upstream moves so divergence is loud rather than silent. The test skips when the monorepo is
not checked out alongside, so builds do not require it.

`@pk/ui` is deliberately not vendored: its components encode the other storefront's visual
system, which FONEKIST does not share (`docs/ADR-001-visual-system.md`).

## Commands

```bash
pnpm dev              # :3001, one process, recompiles per route. Never measure this.
pnpm build            # also completes the standalone output
pnpm serve            # production, one worker per core. This is what to measure.
pnpm start            # production, single process. Use `serve` unless you need this.
pnpm loadtest         # capacity check against a running `pnpm serve`
pnpm typecheck
pnpm lint
pnpm test             # vitest, including the contracts drift test
pnpm test:e2e         # playwright, needs the backend on :9000
pnpm test:a11y        # axe, both colour schemes
pnpm sync:contracts   # re-vendor from the monorepo
```

`pnpm test:e2e` runs against `pnpm dev` by default. The instant-navigation tests in
`tests/e2e/instant.spec.ts` assert on prerender and cache headers, which only a production
build sets, so run the suite against one:

```bash
pnpm build && pnpm serve
PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm test:e2e
```

`pnpm loadtest` fails on response errors and reports throughput by default. Throughput is
hardware-dependent; set `MIN_RPS_STATIC` and `MIN_RPS_STREAMED` to turn the measured figures
into regression gates on a fixed deployment runner.

## Performance and capacity

The site is built around one rule: **a page a customer can reach should already exist.**

Every route is prerendered to a static shell at build time. The parts that genuinely depend
on the request, filters in the URL, a shortlist cookie, a live stock count, are wrapped in
`<Suspense>` and stream in afterwards. This is Next's Cache Components model, enabled by
`cacheComponents` and `partialPrefetching` in `next.config.ts`.

Two consequences are worth knowing before changing anything here:

- **A server-side `cookies()` or `headers()` read in a shared component costs the whole site
  its static shell.** The header badge used to read the query cookie on the server. Measured,
  that one read was the difference between roughly 80 and roughly 700 requests a second, and
  between pages a CDN may cache and pages marked `private, no-store`. The count is read in
  the browser now (`src/components/query-badge.tsx`); the shortlist itself stays `httpOnly`.
- **Photographs are resized at build time, never per request** (`scripts/derive-media.mjs`,
  `src/components/photo.tsx`). Four widths in AVIF and WebP, served through `<picture>`, so
  the server does no image work and `/_next/image` is on no path. A catalogue page on a phone
  went from 3,199 KB of photography to 462 KB. Run `pnpm derive:media` after changing
  anything in `public/media`; `pnpm build` and `pnpm dev` both run it, and it skips files
  whose derivatives are already current. `sharp` is a runtime dependency rather than a dev
  one only so that a production install still has it at build time; nothing serves an image
  through it, and Next traces it into `.next/standalone` either way.

- **Catalogue reads are cached for an hour** (`src/lib/catalog.ts`, `src/lib/search.ts`).
  Price and stock are still decided by commerce and re-read uncached when an application is
  submitted; the unit count on a product page is read on a short profile so "Only N left" is
  never an hour old. `POST /api/revalidate` expires a tag on demand for anything urgent.

### Measured on an 8-core laptop, backend running

| Route | req/s | ≈ concurrent visitors | Cacheable by a CDN |
|---|---|---|---|
| `/`, `/brands`, `/installments`, `/track`, `/policies/*` | ~715 | ~7,100 | yes, `s-maxage=3600` |
| `/phones`, `/brands/[handle]`, `/p/[handle]` | ~170-240 | ~1,700-2,400 | no, they read the URL |

Concurrent visitors assume ten seconds of reading between clicks, which is what
`scripts/loadtest.mjs` reports. Medusa's own latency was flat before, during and after the
run: the cache absorbs the traffic rather than passing it through.

Absolute figures on a developer machine drift by tens of per cent depending on what else is
running. Any comparison between two versions should be made the way the note in *Scaling
further* describes: both builds serving at once on different ports, runs interleaved.

### Photography, per page view

| Page, on a phone | before | after |
|---|---|---|
| `/phones`, 24 tiles | 3,199 KB | 462 KB |
| `/`, 20 images | 2,760 KB | 543 KB |
| `/p/[handle]`, gallery | 262 KB | 39 KB |

### Scaling further

1. **Put a CDN in front.** The static routes already send `s-maxage=3600,
   stale-while-revalidate`, so an edge answers them without the origin. This is free and it
   is the largest single gain available.
2. **Add cores.** Throughput scales close to linearly with `WORKERS` up to the point where
   the load generator and the server compete for the same machine: measured 53, 104 and 167
   req/s on `/phones` at one, two and four workers.
3. **More than one machine.** Then you need `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` shared
   across instances, a `deploymentId`, and a shared cache through `cacheHandlers`, because
   `use cache` is per-process by default and each worker holds its own copy.
4. **Images are done; the comparison chips are not worth doing.** An earlier note here said
   the twenty-four chips on a catalogue page cost 47% of its serve throughput and that
   collapsing them into one delegated listener was the next win. Both halves were wrong, and
   the correction is worth keeping because it is counter-intuitive.

   Measured properly, with two builds running side by side on separate ports and the runs
   interleaved (a single machine's readings drift by tens of per cent over minutes, which is
   what produced the 47%), rendering the chips at all costs **6%**: 84 req/s against 90 with
   them off. And rebuilding them as server markup driven by one delegated listener made the
   page **8% slower**, not faster. React serialises a *server* component's whole element tree
   once per instance into the flight payload, while a *client* component costs one module
   reference plus its props, so twenty-four identical interactive controls are genuinely
   cheaper as client components. The flight payload grew 41 KB. On a six-times throttled CPU
   neither hydration time (0.174s against 0.181s) nor the time to toggle a chip (31.4ms
   against 30.1ms) could tell the two apart.

   The chips are therefore left exactly as they were. The remaining catalogue cost is the
   flight payload itself, which is 71% of the document.

## House rules

- No em dash or en dash in anything a customer sees.
- Every figure on a page is counted or configured. No fabricated urgency, savings, ratings
  or stock claims. There is no review data, so there are no ratings.
- Search and listing data may lag; price, stock and payment are revalidated in commerce.
- WCAG 2.2 AA is part of Definition of Done. Targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.

## Routes

| Route | What it is |
|---|---|
| `/` | Brands, newest stock, the installment explainer, the phone finder, budget collections |
| `/phones` | The catalogue, with brand, monthly-payment, stock and spec filters in the URL |
| `/brands`, `/brands/[handle]` | Brand directory and brand pages. Sub-brand URLs redirect to the manufacturer |
| `/p/[handle]` | Product page: gallery, variants, the plans and their full disclosure, PTA status, specs |
| `/compare?ids=a,b,c` | Up to three phones side by side, live prices, differences-only toggle |
| `/installments` | How the offer works, and what it costs |
| `/installments/apply` | The credit application |
| `/installments/status` | Check an application with its reference and phone number |
| `/search` | Search with typo tolerance and type-ahead |
| `/query` | The shortlist: handsets and the plan chosen for each, with the total for every one |
| `/order/[id]`, `/track` | Order detail, tracking timeline and return requests |
| `/policies/[slug]` | Installments, returns, warranty, PTA status, delivery |

## Feature flags

Both default off. Only the exact string `"true"` enables one.

- `NEXT_PUBLIC_FEATURE_COMPARISON` — enable once the comparison e2e suite passes.
- `NEXT_PUBLIC_FEATURE_INSTALLMENTS` — gates CNIC intake, not the shop. With it off the
  plans, the disclosure and the query all still work and `/installments/apply` and
  `/installments/status` are not found; the plan panel offers a WhatsApp handoff instead.
  Enable only after the security tests, the admin review acceptance pass **and** the legal
  review in ADR-025 all clear.

## Verifying

```bash
pnpm typecheck && pnpm lint
pnpm test        # unit and the contract drift check
pnpm test:e2e    # needs commerce on :9000 and this storefront on :3001
pnpm test:a11y   # axe, both colour schemes, desktop and mobile
```

The phone-only guarantee cannot be verified by reading this repository. Nothing here filters
for phones, deliberately (ADR-022), so `tests/e2e/catalog-boundary.spec.ts` against a running
backend is the only thing that can confirm it. It checks every search-backed route
independently, because the search index is a separate boundary that has been broken before
(ADR-027).
