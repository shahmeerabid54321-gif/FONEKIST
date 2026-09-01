import { defineMiddlewares, type MedusaNextFunction, type MedusaRequest, type MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COD_VERIFICATION_MODULE } from "../modules/cod-verification";
import type CodVerificationService from "../modules/cod-verification/service";
import { codVerificationRequired } from "../modules/cod-verification/policy";
import { fail, requestIdOf } from "../lib/http";

/**
 * Blocks completion of a COD cart that has not been confirmed.
 *
 * This is the gate, not the checkout UI. The browser is untrusted
 * (07_SYSTEM_ARCHITECTURE.md section 15), so hiding the "Place order" button until the
 * code is entered controls nothing — the request that actually creates the order has to be
 * the thing that refuses.
 *
 * It sits in a middleware rather than in the COD payment provider because the check needs
 * the cod-verification module, and a payment provider reaching across module boundaries to
 * find it would break the boundary that ADR-005 exists to keep.
 */
async function requireCodVerification(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const cartId = req.params.id;
    if (!cartId) return next();

    // The cart, its total and its payment sessions in one read. `query.graph` follows the
    // module link between Cart and Payment, which listing every payment collection and
    // filtering in memory would not — that version worked and would have quietly become a
    // full-table scan on every checkout.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "total", "payment_collection.payment_sessions.provider_id"],
      filters: { id: cartId },
    });

    const cart = carts?.[0];
    if (!cart) return next();

    const usingCod =
      cart.payment_collection?.payment_sessions?.some((session) =>
        String(session?.provider_id ?? "").includes("cod"),
      ) ?? false;

    if (!usingCod || !codVerificationRequired(Number(cart.total ?? 0))) return next();

    const verification: CodVerificationService = req.scope.resolve(COD_VERIFICATION_MODULE);
    if (await verification.isCartVerified(cartId)) return next();

    res.status(409).json(
      fail(
        {
          code: "CONFLICT",
          message:
            "Confirm your phone number before placing this cash-on-delivery order. We sent you a code.",
        },
        requestId,
      ),
    );
  } catch (error) {
    // A failure to *check* must not become a failure to buy for every other payment
    // method, so the error is surfaced through the normal envelope rather than thrown into
    // Medusa's cart pipeline.
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/carts/:id/complete",
      method: "POST",
      middlewares: [requireCodVerification],
    },
  ],
});
