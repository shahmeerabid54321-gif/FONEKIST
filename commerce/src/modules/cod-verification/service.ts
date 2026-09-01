import { MedusaService } from "@medusajs/framework/utils";
import { AppError } from "@pk/contracts";
import { CodVerification } from "./models";
import { codeMatches, generateCode, hashCode, maskPhone } from "./codes";

/**
 * COD verification challenges.
 *
 * 08_DATA_MODEL.md section 12 and 09_API_AND_EVENT_CONTRACTS.md section 4: attempt limits,
 * expiry and replay protection are all requirements, not refinements. A challenge that can
 * be retried indefinitely verifies nothing — six digits fall in under a second.
 */

/** Long enough to fetch a phone from another room, short enough to limit a stolen code's window. */
const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export interface StartResult {
  challengeId: string;
  code: string;
  maskedDestination: string;
  expiresAt: Date;
  attemptsRemaining: number;
}

interface ChallengeRow {
  id: string;
  cart_id: string;
  order_id: string | null;
  phone: string;
  code_hash: string;
  status: "not_required" | "pending" | "verified" | "failed" | "expired";
  attempts: number;
  max_attempts: number;
  expires_at: string | Date;
  verified_at: string | Date | null;
}

class CodVerificationService extends MedusaService({ CodVerification }) {
  private secret(): string {
    const secret = process.env.COD_VERIFICATION_SECRET ?? process.env.JWT_SECRET;
    if (!secret) {
      // Refusing to run beats hashing under a constant: an empty key makes every stored
      // hash forgeable by anyone who reads this repository.
      throw new AppError("INTERNAL_ERROR", {
        message: "Order confirmation is unavailable right now.",
        internal: "COD_VERIFICATION_SECRET (or JWT_SECRET) is not set.",
      });
    }
    return secret;
  }

  /**
   * Opens a challenge for a cart, superseding any earlier one.
   *
   * Superseding rather than reusing is what stops a customer holding several live codes at
   * once: only the most recent one can ever verify.
   */
  async start(input: { cartId: string; phone: string }): Promise<StartResult> {
    const existing = (await this.listCodVerifications({
      cart_id: input.cartId,
      status: "pending",
    })) as unknown as ChallengeRow[];

    for (const challenge of existing) {
      await this.updateCodVerifications({
        selector: { id: challenge.id },
        data: { status: "expired", reason_code: "superseded" },
      });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

    const created = (await this.createCodVerifications({
      cart_id: input.cartId,
      phone: input.phone,
      code_hash: hashCode(code, this.secret()),
      method: "otp",
      status: "pending",
      attempts: 0,
      max_attempts: MAX_ATTEMPTS,
      expires_at: expiresAt,
    })) as unknown as ChallengeRow;

    return {
      challengeId: created.id,
      // Returned to the caller so it can be delivered, never stored and never logged.
      code,
      maskedDestination: maskPhone(input.phone),
      expiresAt,
      attemptsRemaining: MAX_ATTEMPTS,
    };
  }

  /**
   * Checks a submitted code.
   *
   * Every terminal outcome is recorded on the challenge, so a challenge can be used exactly
   * once: an already-verified challenge does not verify again, which is what makes a
   * replayed request harmless.
   */
  async complete(input: { challengeId: string; code: string }): Promise<{
    verified: boolean;
    attemptsRemaining: number;
    reason?: string;
  }> {
    const [challenge] = (await this.listCodVerifications({
      id: input.challengeId,
    })) as unknown as ChallengeRow[];

    if (!challenge) return { verified: false, attemptsRemaining: 0, reason: "unknown_challenge" };

    if (challenge.status === "verified") {
      // Not an error and not a second verification: the caller already succeeded.
      return { verified: true, attemptsRemaining: 0 };
    }

    if (challenge.status !== "pending") {
      return { verified: false, attemptsRemaining: 0, reason: challenge.status };
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await this.updateCodVerifications({
        selector: { id: challenge.id },
        data: { status: "expired", reason_code: "expired" },
      });
      return { verified: false, attemptsRemaining: 0, reason: "expired" };
    }

    const attempts = challenge.attempts + 1;
    const attemptsRemaining = Math.max(0, challenge.max_attempts - attempts);

    if (!codeMatches(input.code, challenge.code_hash, this.secret())) {
      await this.updateCodVerifications({
        selector: { id: challenge.id },
        data:
          attemptsRemaining === 0
            ? { attempts, status: "failed", reason_code: "attempts_exhausted" }
            : { attempts },
      });
      return { verified: false, attemptsRemaining, reason: "incorrect" };
    }

    await this.updateCodVerifications({
      selector: { id: challenge.id },
      data: { attempts, status: "verified", verified_at: new Date(), reason_code: null },
    });

    return { verified: true, attemptsRemaining };
  }

  /** Whether a cart currently holds a live, verified challenge. */
  async isCartVerified(cartId: string): Promise<boolean> {
    const verified = (await this.listCodVerifications({
      cart_id: cartId,
      status: "verified",
    })) as unknown as ChallengeRow[];

    return verified.length > 0;
  }

  /** Links the challenge to the order it authorised, once that order exists. */
  async attachOrder(cartId: string, orderId: string): Promise<void> {
    await this.updateCodVerifications({
      selector: { cart_id: cartId, status: "verified" },
      data: { order_id: orderId },
    });
  }
}

export default CodVerificationService;
