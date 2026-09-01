import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { searchRequestSchema } from "@pk/contracts";
import { fail, ok, requestIdOf } from "../../../lib/http";
import { resolveSearchProvider } from "../../../lib/search-provider";

/**
 * GET /store/search
 *
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 5 — a storefront endpoint rather
 * than a search engine exposed to the browser, so no engine key ever reaches a client and
 * the response shape survives the engine being replaced (ADR-004).
 *
 * Search is non-authoritative (ADR-014): everything here is revalidated in commerce before
 * anything is added to a cart or charged.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    // `attr.<key>=a,b` is parsed out of the flat query string before validation, so the
    // schema sees the structured shape it declares.
    const attributes: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (!key.startsWith("attr.") || value == null) continue;
      const values = (Array.isArray(value) ? value : [value])
        .flatMap((entry) => String(entry).split(","))
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (values.length > 0) attributes[key.slice("attr.".length)] = values;
    }

    const brand = req.query.brand
      ? (Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand])
          .flatMap((entry) => String(entry).split(","))
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

    const brandHandle = req.query.brand_handle
      ? (Array.isArray(req.query.brand_handle) ? req.query.brand_handle : [req.query.brand_handle])
          .flatMap((entry) => String(entry).split(","))
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

    /*
     * The sales-channel boundary (ADR-022).
     *
     * Taken from the publishable key that Medusa has already verified, and spread AFTER
     * `req.query` so a client cannot widen its own scope by passing `sales_channel_ids` in
     * the query string. Medusa applies this scoping to `/store/products` itself; a derived
     * index inherits none of it, so without this every key reads the whole catalogue.
     */
    const salesChannelIds = req.publishable_key_context?.sales_channel_ids ?? [];

    const parsed = searchRequestSchema.safeParse({
      ...req.query,
      brand,
      brand_handle: brandHandle,
      attributes,
      sales_channel_ids: salesChannelIds,
    });
    if (!parsed.success) {
      const { status, body } = fail(
        {
          code: "VALIDATION_ERROR" as const,
          message: "That search request could not be read.",
          field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        },
        requestId,
        true,
      );
      res.status(status).json(body);
      return;
    }

    const provider = resolveSearchProvider(req.scope);
    const response = await provider.search(parsed.data);

    res.json(ok(response, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
