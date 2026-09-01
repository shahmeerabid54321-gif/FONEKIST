import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { deliveryQuoteRequestSchema } from "@pk/contracts";
import { quoteDelivery } from "../../../../lib/delivery";
import { fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * GET /store/delivery/quote?cart_id=...&province=...&city=...
 *
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 4.
 *
 * Returns the service, fee and ETA range for a destination. CUST-010 requires the customer
 * to see method, cost and ETA before ordering. The cart subtotal is read from commerce
 * rather than accepted from the caller — a browser-supplied subtotal would let anyone
 * trigger free shipping.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  const parsed = deliveryQuoteRequestSchema.safeParse({
    cart_id: req.query.cart_id,
    province: req.query.province,
    city: req.query.city,
    area: req.query.area,
  });

  if (!parsed.success) {
    res.status(400).json(
      fail(
        {
          code: "VALIDATION_ERROR",
          message: "We could not work out a delivery quote from those details.",
          field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        },
        requestId,
      ),
    );
    return;
  }

  try {
    const cartService = req.scope.resolve(Modules.CART);
    const [cart] = await cartService.listCarts({ id: parsed.data.cart_id });

    if (!cart) {
      res.status(404).json(
        fail({ code: "NOT_FOUND", message: "We could not find that cart." }, requestId),
      );
      return;
    }

    const subtotal = Number(cart.subtotal ?? 0);
    const codCeiling = Number(process.env.COD_MAX_ORDER_VALUE_PKR ?? 150000);

    const options = quoteDelivery({
      province: parsed.data.province,
      city: parsed.data.city,
      subtotal,
      codEligibleByValue: subtotal <= codCeiling,
    });

    res.json(ok({ options }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
