import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signature verification.
 *
 * This is a real HMAC implementation rather than a stub, because it is the security
 * control behind PAY-001 ("invalid signature mutates nothing") and it is what a genuine
 * provider adapter will replace method-for-method. The signing scheme below —
 * `HMAC-SHA256(timestamp + "." + rawBody)` presented as `t=<ts>,v1=<hex>` — is the shape
 * used by most payment providers, so the verification logic transfers directly.
 */

export const SIGNATURE_HEADER = "x-sandbox-signature";

/** Replay window. API contract section 7 step 3: verify timestamp where the provider supports it. */
export const REPLAY_TOLERANCE_SECONDS = 300;

export class WebhookVerificationError extends Error {
  constructor(readonly reason: string) {
    super(`Webhook verification failed: ${reason}`);
    this.name = "WebhookVerificationError";
  }
}

export function signPayload(secret: string, rawBody: string, timestampSeconds: number): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

function parseHeader(header: string): { timestamp: number; signature: string } {
  const parts = new Map(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    }),
  );

  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v1");

  if (!Number.isFinite(timestamp) || !signature) {
    throw new WebhookVerificationError("malformed signature header");
  }
  return { timestamp, signature };
}

/**
 * Verifies a webhook signature against the raw request body.
 *
 * Must be given the RAW body, not a re-serialised object: JSON.stringify does not
 * round-trip byte-for-byte, so re-serialising would break verification for valid requests
 * and, worse, could be worked around by relaxing the check.
 */
export function verifySignature(input: {
  secret: string;
  rawBody: string;
  header: string | null | undefined;
  nowSeconds?: number;
}): void {
  if (!input.secret) {
    throw new WebhookVerificationError("no webhook secret configured");
  }
  if (!input.header) {
    throw new WebhookVerificationError("missing signature header");
  }

  const { timestamp, signature } = parseHeader(input.header);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestamp) > REPLAY_TOLERANCE_SECONDS) {
    throw new WebhookVerificationError("timestamp outside replay window");
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(signature, "hex");

  // Length check first: timingSafeEqual throws on a length mismatch.
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new WebhookVerificationError("signature mismatch");
  }
}
