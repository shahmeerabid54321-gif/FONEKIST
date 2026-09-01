import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { pkMobileSchema } from "@pk/contracts";
import { phonesMatch } from "../../../../lib/phone-match";
import { rateLimit } from "../../../../lib/rate-limit";
import { clientIpOf, fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * POST /store/orders/lookup
 *
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 4 and CUST-018.
 *
 * Takes the public order reference plus a second factor (the phone used at checkout).
 * Order display ids are sequential and therefore guessable, so the second factor is what
 * actually protects the order — the reference alone never grants access.
 *
 * Rate limited per client (SEC-004): without it this endpoint is a phone-number oracle.
 */

const LOOKUP_LIMIT = 8;
const LOOKUP_WINDOW_SECONDS = 15 * 60;

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  const limit = rateLimit(`order-lookup:${clientIpOf(req)}`, LOOKUP_LIMIT, LOOKUP_WINDOW_SECONDS);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfterSeconds));
    res.status(429).json(
      fail(
        { code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again." },
        requestId,
      ),
    );
    return;
  }

  try {
    const body = req.body as { reference?: string; phone?: string };
    const reference = String(body.reference ?? "").trim().replace(/^#/, "");
    const phone = pkMobileSchema.safeParse(body.phone ?? "");

    // A single generic failure for every rejection path below. Distinguishing "no such
    // order" from "wrong phone" would let an attacker enumerate valid references.
    const notFound = () =>
      res.status(404).json(
        fail(
          { code: "NOT_FOUND", message: "We could not find an order matching those details." },
          requestId,
        ),
      );

    if (!reference || !/^\d+$/.test(reference) || !phone.success) {
      notFound();
      return;
    }

    // `display_id` is not part of Medusa's typed order filters, so the lookup goes through
    // the query graph, which does support it.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "shipping_address.phone"],
      // The graph filter is typed as a string here even though the column is numeric.
      filters: { display_id: reference },
    });

    const order = orders?.[0];
    if (!order) {
      notFound();
      return;
    }

    const storedPhone = order.shipping_address?.phone ?? "";
    if (!phonesMatch(storedPhone, phone.data)) {
      notFound();
      return;
    }

    res.json(ok({ order_id: order.id }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
