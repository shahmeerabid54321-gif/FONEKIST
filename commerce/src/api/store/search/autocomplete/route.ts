import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { clientIpOf, fail, ok, requestIdOf } from "../../../../lib/http";
import { resolveSearchProvider } from "../../../../lib/search-provider";
import { rateLimit } from "../../../../lib/rate-limit";

/**
 * GET /store/search/autocomplete?q=...
 *
 * Type-ahead for the header search (CUST-002). Rate limited because it is called on
 * keystrokes: a public endpoint that runs a similarity scan per character is an easy way
 * to make the database everyone's problem.
 */
const MAX_SUGGESTIONS = 8;

/** Generous for a person typing, restrictive for a script scraping the catalogue. */
const PER_MINUTE = 120;

export async function GET(req: MedusaStoreRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const limited = rateLimit(`search-autocomplete:${clientIpOf(req)}`, PER_MINUTE, 60);
    if (!limited.allowed) {
      res.setHeader("retry-after", String(limited.retryAfterSeconds));
      res.status(429).json(
        fail(
          { code: "RATE_LIMITED", message: "Too many requests. Please slow down." },
          requestId,
        ),
      );
      return;
    }

    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json(ok({ suggestions: [] }, requestId));
      return;
    }

    // Scoped to the key's sales channels, exactly like search (ADR-022). Suggesting a
    // product this storefront cannot sell sends the customer to a 404.
    const salesChannelIds = req.publishable_key_context?.sales_channel_ids ?? [];

    const provider = resolveSearchProvider(req.scope);
    const suggestions = await provider.autocomplete(q, MAX_SUGGESTIONS, salesChannelIds);

    res.json(ok({ suggestions }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
