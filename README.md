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

Set `NEXT_PUBLIC_MEDIA_BASE_URL=http://localhost:3000` and run the Voltmark storefront
alongside (`pnpm --filter storefront dev`).

The shared backend stores root-relative media paths like `/media/products/x/01.jpg`, which
resolve only on the origin whose `public/` the seed wrote them into, and that is Voltmark's.
FONEKIST is a different origin, so without the base URL every product image 404s. In
production this variable points at the CDN instead, which is the actual fix (ADR-012
upstream). See `src/lib/media.ts`.

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
pnpm dev              # :3001
pnpm build
pnpm typecheck
pnpm lint
pnpm test             # vitest, including the contracts drift test
pnpm test:e2e         # playwright, needs the backend on :9000
pnpm test:a11y        # axe, both colour schemes
pnpm sync:contracts   # re-vendor from the monorepo
```

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
