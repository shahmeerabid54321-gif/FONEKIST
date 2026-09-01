import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { codVerifyStartRequestSchema } from "@pk/contracts";
import { COD_VERIFICATION_MODULE } from "../../../../../modules/cod-verification";
import type CodVerificationService from "../../../../../modules/cod-verification/service";
import { codVerificationRequired } from "../../../../../modules/cod-verification/policy";
import { clientIpOf, fail, ok, requestIdOf } from "../../../../../lib/http";
import { rateLimit } from "../../../../../lib/rate-limit";
import { deliverTransient } from "../../../../../lib/notifications/send";

/**
 * POST /store/cod/verify/start
 *
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 4 — rate limited, uses the
 * checkout-associated phone, and returns a challenge id, a masked destination and an
 * expiry. It never returns the code, and never echoes the full phone number back.
 */

/** Per IP. Enough for a genuine "I didn't get it, resend", far short of enumeration. */
const START_LIMIT = 5;
const START_WINDOW_SECONDS = 10 * 60;

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  const limit = rateLimit(`cod-verify-start:${clientIpOf(req)}`, START_LIMIT, START_WINDOW_SECONDS);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfterSeconds));
    res.status(429).json(
      fail(
        { code: "RATE_LIMITED", message: "Too many requests. Please wait a few minutes." },
        requestId,
      ),
    );
    return;
  }

  const parsed = codVerifyStartRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      fail(
        {
          code: "VALIDATION_ERROR",
          message: "We need a valid Pakistani mobile number to confirm this order.",
          field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        },
        requestId,
      ),
    );
    return;
  }

  try {
    const carts = req.scope.resolve(Modules.CART);
    const [cart] = await carts.listCarts({ id: parsed.data.cart_id });

    if (!cart) {
      res.status(404).json(fail({ code: "NOT_FOUND", message: "We could not find that cart." }, requestId));
      return;
    }

    if (!codVerificationRequired(Number(cart.total ?? 0))) {
      // Below the threshold there is nothing to confirm; saying so is clearer than issuing
      // a challenge the checkout would then ignore.
      res.json(ok({ required: false }, requestId));
      return;
    }

    const verification: CodVerificationService = req.scope.resolve(COD_VERIFICATION_MODULE);
    const challenge = await verification.start({
      cartId: cart.id,
      phone: parsed.data.phone,
    });

    // Deliberately *not* through the notification outbox: that persists every message, and
    // a stored confirmation code would undo the point of only keeping its hash. Delivery
    // failure is logged rather than thrown, so a challenge that could not be delivered is
    // still visible to support instead of vanishing (REL-001).
    await deliverTransient(req.scope, {
      to: parsed.data.phone,
      channel: "sms",
      template: "cod.verification_code",
      data: { code: challenge.code, expires_in_minutes: 10 },
    });

    res.json(
      ok(
        {
          required: true,
          challenge_id: challenge.challengeId,
          masked_destination: challenge.maskedDestination,
          expires_at: challenge.expiresAt.toISOString(),
          attempts_remaining: challenge.attemptsRemaining,
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
