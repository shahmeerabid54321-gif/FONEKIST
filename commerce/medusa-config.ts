import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

/**
 * Commerce configuration.
 *
 * ADR-019: local development runs entirely on PostgreSQL with Medusa's in-memory event
 * bus, cache and workflow engine. Staging and production set REDIS_URL, which swaps in the
 * Redis-backed modules without any code change. Nothing else in the codebase branches on
 * this — the difference is contained here.
 */
const REDIS_URL = process.env.REDIS_URL;
const usingRedis = Boolean(REDIS_URL);

const infrastructureModules = usingRedis
  ? [
      {
        resolve: "@medusajs/medusa/cache-redis",
        options: { redisUrl: REDIS_URL },
      },
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        options: { redisUrl: REDIS_URL },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: { redis: { url: REDIS_URL } },
      },
    ]
  : [
      { resolve: "@medusajs/medusa/cache-inmemory" },
      { resolve: "@medusajs/medusa/event-bus-local" },
      { resolve: "@medusajs/medusa/workflow-engine-inmemory" },
    ];

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // TRD section 10: strict CORS allowlist, no wildcards.
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET!,
      cookieSecret: process.env.COOKIE_SECRET!,
    },
  },
  admin: {
    // ADR-013: extend Medusa Admin rather than rewriting it.
    disable: process.env.DISABLE_ADMIN === "true",
  },
  modules: [
    ...infrastructureModules,

    // Custom electronics domain modules — only where Medusa has a genuine gap (ADR-002).
    {
      resolve: "./src/modules/electronics-attributes",
    },
    {
      resolve: "./src/modules/warranty",
    },
    {
      resolve: "./src/modules/idempotency",
    },
    // Customer return requests (08_DATA_MODEL.md section 13).
    {
      resolve: "./src/modules/returns",
    },
    // COD confirmation challenges (08_DATA_MODEL.md section 12).
    {
      resolve: "./src/modules/cod-verification",
    },
    // Curated installment offers and the credit applications against them (ADR-023).
    // FONEKIST is the lender, so this module holds the evidence for a receivable rather
    // than a lead, and ADR-024 governs the identity data in it.
    {
      resolve: "./src/modules/installments",
    },
    // The derived search index (ADR-004). The engine behind it is selected in
    // src/lib/search-provider.ts; this module only stores the documents.
    {
      resolve: "./src/modules/search",
    },

    // Customer notifications (07_SYSTEM_ARCHITECTURE.md section 12). No email or SMS
    // provider is contracted yet, so messages are rendered and persisted rather than sent;
    // the stored record is the outbox a real provider will drain (ADR-006).
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/notification-outbox",
            id: "outbox",
            options: {
              channels: ["email", "sms"],
              logBody: process.env.NODE_ENV !== "production",
            },
          },
        ],
      },
    },

    // Delivery pricing and shipment booking (FUL-001). The zone table it prices from is
    // the same one the storefront quotes from, so a quote and a charge cannot disagree.
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "./src/modules/fulfillment-pk-courier",
            id: "pk-courier",
            options: {},
          },
        ],
      },
    },

    // Payment providers behind the adapter boundary (ADR-006).
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/payment-cod",
            id: "cod",
            options: {
              // Merchant-configurable without a deploy (TRD section 14).
              maxOrderValuePkr: Number(process.env.COD_MAX_ORDER_VALUE_PKR ?? 150000),
            },
          },
          {
            resolve: "./src/modules/payment-installment",
            id: "installment",
            options: {
              maxOrderValuePkr: Number(process.env.INSTALLMENT_MAX_ORDER_VALUE_PKR ?? 500000),
            },
          },
          {
            resolve: "./src/modules/payment-sandbox",
            id: "sandbox",
            options: {
              webhookSecret: process.env.SANDBOX_PAYMENT_WEBHOOK_SECRET ?? "",
              apiKey: process.env.SANDBOX_PAYMENT_API_KEY ?? "",
              baseUrl: process.env.SANDBOX_PAYMENT_BASE_URL ?? "",
            },
          },
        ],
      },
    },
  ],
});
