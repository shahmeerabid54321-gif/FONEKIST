# Production readiness and local capacity evidence

Status: work in progress. Owner staging review and public production launch are not complete.

## Local test, 8 September 2026

Apple M2, 8 logical CPUs, 16 GB RAM. Storefront production build, local PostgreSQL,
separate commerce backend on port 9100 and disposable database
`fonekist_loadtest_20260908`. No existing shop orders or inventory were modified.
Backend uses the in-memory workflow engine; this does not certify a Redis deployment.

Four storefront workers, ten seconds per route and concurrency step:

| Page | 100 connections: req/s | p99 | 250 connections: req/s | p99 |
|---|---:|---:|---:|---:|
| Home | 768 | 302 ms | 798 | 1,087 ms |
| Catalogue | 159 | 4,035 ms | 95 | 3,574 ms |
| Filtered catalogue | 236 | 687 ms | 124 | 3,583 ms |
| Brand | 191 | 806 ms | 118 | 3,463 ms |
| Product | 170 | 1,179 ms | 94 | 4,585 ms |

No HTTP errors in that run. This is continuous HTTP document traffic, not full browser
journeys. A prior eight-worker saturation run had timeouts at 500 and 1,000 connections
and was stopped. It overlapped early test work and is diagnostic, not a clean comparison.
No claim of 10,000 simultaneous customers is supported by these measurements.

### Application submission

Initial test exposed guest-customer creation races and inventory conflicts returning 500.
Fixed the narrow guest uniqueness retry before order creation and preserved domain errors
through the idempotency service. After fixes:

- 10 simultaneous applications: 10 successful, p95 2.73 seconds.
- 100 simultaneous applications: 100 successful, p95 20.98 seconds, 21.06 seconds overall.
- Four simultaneous identical requests plus a completed retry: one application/order,
  one public reference; contenders receive 409 while the winner runs.
- Ten customers competing for five units: exactly five successful orders, five
  `409 OUT_OF_STOCK` responses, reserved stock did not exceed stocked quantity.
- The 100-request run plus duplicate/stock scenarios produced 106 applications,
  106 distinct carts, and 106 distinct orders.

These were direct API submissions with synthetic document metadata and synthetic customer
identity data. They do not test document upload, malware scanning, approval, notifications,
or a browser submitting the form. Forwarded test addresses model separate clients; proxy
trust and distributed rate limiting remain unverified. The action has a 30-second submission
timeout, so the 21-second tail has limited headroom. Its retry key now persists per form.

### Inquiry submission

The separate inquiry endpoint does not create orders or reserve inventory. In the isolated
database, 100 simultaneous inquiries succeeded (p95 approximately 815 ms), twenty retries
of one submission produced one reference, and twenty submissions competing for five coupon
redemptions accepted exactly five. Changed prices, unsupported cities, and reuse of a key
with changed contents were rejected. Two 1,000-request bursts had connection timeouts
(132 and 137 respectively); this is a failed capacity target, not a 10,000-customer pass.
The second burst overlapped browser testing and is diagnostic.

### Verification

122 storefront unit tests and 156 commerce unit tests pass. One existing storefront test is
intentionally skipped. Storefront lint/typecheck and commerce/admin typechecks pass.
React 18 type resolution is scoped to commerce; Next continues using React 19.
On 9 September, inquiry checkout passed on desktop and mobile against the compiled backend.
The desktop owner test passed login, unauthenticated endpoint rejection, saving settings,
creating a coupon, persistence after reload, viewing masked inquiry details and changing state.
The 150-case desktop/mobile suite finished with 144 passes, two intentional skips and four
image fixture failures. The fresh seed had no photo assignments. After attaching the existing
repository images through the local admin API, all six image checks passed. Checkout also
passed axe checks in both light and dark modes on desktop/mobile. This is automated coverage;
manual owner review and actual staging verification remain outstanding.

Start the built backend from `commerce/.medusa/server`, not `commerce`: the production admin
assets are emitted there. Local admin tests model the HTTPS proxy header so production's
secure session cookies are preserved; actual Render TLS behavior still needs verification.

### Reproduction and evidence

New local raw reports are in `test-results/local-capacity/` (ignored because they are local
artifacts). Earlier browsing/order raw reports were accidentally cleared by Playwright's
default output cleanup; the figures above are recorded observations, and must be rerun for
a complete retained evidence package. Playwright now has its own output subdirectory.
`scripts/loadtest.mjs` saves JSON when `REPORT_PATH` is set, labels p97.5
correctly, avoids counting timeouts twice, and stops at the first failure by default.
`scripts/loadtest-orders.mjs` only accepts localhost:9100 and the explicitly named disposable
database. It creates synthetic orders, document metadata and adjusts test stock; never run
it against business data. `ORDER_CONCURRENCY` accepts 1..100. It does not send real email.

## Remaining launch requirements

### Verified Render backend configuration (9 September)

Service `srv-dab1vkn10e5c739kht60` is Free in Oregon, serving
`https://fonekist-backend.onrender.com` from `main`. The last successful commit shown was
`7a766ba75a88af7a07c7f04926b83dc2e85fa1d3`. Its current build disables admin explicitly.
Before the next owner-staging deployment, change the build command to:

```sh
pnpm install --frozen-lockfile && pnpm --filter @pk/contracts build && DISABLE_ADMIN=false pnpm --filter commerce build
```

Set runtime `DISABLE_ADMIN=false` and use `node scripts/start-commerce.mjs` as the start
command. This checks admin assets, migrates from the compiled directory, then serves it.
The existing database is already provisioned; seeding is not run on every restart.
These dashboard changes have not been applied yet.

Durable catalogue storage is configurable with `CATALOG_S3_*` variables documented in
`commerce/.env.example`. Bucket connectivity and uploaded-photo persistence still require
verification. With no storage variables, the local provider remains for development.

The retained 9 September order retest passed 100/100 simultaneous applications with p95
21.864 seconds, plus duplicate and scarce-stock integrity checks (106 distinct orders/carts).

- Complete wider admin product, image, category, brand and installment-plan verification.
- Verify photo uploads use durable storage on Render, not ephemeral local files.
- Validate cache invalidation across workers after admin edits.
- Implement production capacity controls and measure realistic mixed browsing/submission
  load with explicit latency/error targets. A CDN, shared state and sufficient origin/database
  capacity are needed before certifying 10,000 customers.
- Run final mobile/desktop and accessibility checks against the resulting production build.
- Deploy and verify free Render staging, with no production capacity claims, then owner review.
- Replace stand-in photography with merchant-approved product images before public launch.

Render's free services sleep after inactivity, lack horizontal scaling and persistent disks,
and free PostgreSQL expires after 30 days. Treat this as review staging, not production.
Source: https://render.com/docs/free
