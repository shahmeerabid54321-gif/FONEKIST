import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { codVerifyCompleteRequestSchema } from "@pk/contracts";
import { COD_VERIFICATION_MODULE } from "../../../../../modules/cod-verification";
import type CodVerificationService from "../../../../../modules/cod-verification/service";
import { clientIpOf, fail, ok, requestIdOf } from "../../../../../lib/http";
import { rateLimit } from "../../../../../lib/rate-limit";

/**
 * POST /store/cod/verify/complete
 *
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 4 — attempt limits, expiry and
 * replay protection. The per-challenge attempt limit lives in the service; this adds a
 * per-IP limit on top, because the per-challenge counter alone would let someone open a
 * fresh challenge for every five guesses.
 */
const COMPLETE_LIMIT = 20;
const COMPLETE_WINDOW_SECONDS = 10 * 60;

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  const limit = rateLimit(
    `cod-verify-complete:${clientIpOf(req)}`,
    COMPLETE_LIMIT,
    COMPLETE_WINDOW_SECONDS,
  );
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfterSeconds));
    res.status(429).json(
      fail({ code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes." }, requestId),
    );
    return;
  }

  const parsed = codVerifyCompleteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      fail(
        {
          code: "VALIDATION_ERROR",
          message: "Enter the code exactly as you received it.",
          field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        },
        requestId,
      ),
    );
    return;
  }

  try {
    const verification: CodVerificationService = req.scope.resolve(COD_VERIFICATION_MODULE);
    const result = await verification.complete({
      challengeId: parsed.data.challenge_id,
      code: parsed.data.code,
    });

    // The response is deliberately the same shape whether the challenge was unknown,
    // expired or simply wrong: distinguishing them would confirm which challenge ids exist.
    res.json(
      ok(
        {
          verified: result.verified,
          attempts_remaining: result.attemptsRemaining,
          // A customer needs to know whether to retype or to request a new code; that is
          // the one distinction worth making, and it reveals nothing about other carts.
          expired: result.reason === "expired" || result.reason === "attempts_exhausted",
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
