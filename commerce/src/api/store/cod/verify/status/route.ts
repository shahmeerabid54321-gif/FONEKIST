import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { COD_VERIFICATION_MODULE } from "../../../../../modules/cod-verification";
import type CodVerificationService from "../../../../../modules/cod-verification/service";
import {
  codVerificationRequired,
  codVerificationThreshold,
} from "../../../../../modules/cod-verification/policy";
import { fail, ok, requestIdOf } from "../../../../../lib/http";

/**
 * GET /store/cod/verify/status?cart_id=...
 *
 * Lets checkout render the confirmation step only when it applies, without the storefront
 * keeping its own copy of the threshold. The threshold is a merchant setting, and a second
 * copy of a merchant setting is a future disagreement.
 *
 * This is a convenience for the UI, never a control: the gate is the middleware on cart
 * completion (`src/api/middlewares.ts`).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const cartId = String(req.query.cart_id ?? "").trim();
    if (!cartId) {
      res.status(400).json(
        fail({ code: "VALIDATION_ERROR", message: "cart_id is required." }, requestId),
      );
      return;
    }

    const carts = req.scope.resolve(Modules.CART);
    const [cart] = await carts.listCarts({ id: cartId });
    if (!cart) {
      res.status(404).json(fail({ code: "NOT_FOUND", message: "We could not find that cart." }, requestId));
      return;
    }

    const verification: CodVerificationService = req.scope.resolve(COD_VERIFICATION_MODULE);

    res.json(
      ok(
        {
          required: codVerificationRequired(Number(cart.total ?? 0)),
          verified: await verification.isCartVerified(cartId),
          threshold_pkr: codVerificationThreshold(),
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
