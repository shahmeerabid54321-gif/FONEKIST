import {
  REPLAY_TOLERANCE_SECONDS,
  signPayload,
  verifySignature,
  WebhookVerificationError,
} from "../signature";

/**
 * Payment webhook signature contract tests.
 *
 * Source of truth: PAY-001 ("invalid signature mutates nothing") and
 * 09_API_AND_EVENT_CONTRACTS.md section 7 steps 2-3.
 *
 * These are the tests that must keep passing when the sandbox adapter is replaced by a
 * real provider: the scheme changes, the guarantees do not.
 */

const SECRET = "whsec_test_do_not_use_in_production";
const BODY = JSON.stringify({ event_type: "payment.captured", reference: "sbx_abc", amount: 1000 });

describe("webhook signature verification", () => {
  const now = 1_800_000_000;

  it("accepts a correctly signed, current payload", () => {
    const header = signPayload(SECRET, BODY, now);
    expect(() =>
      verifySignature({ secret: SECRET, rawBody: BODY, header, nowSeconds: now }),
    ).not.toThrow();
  });

  it("rejects a payload signed with the wrong secret", () => {
    const header = signPayload("attacker-secret", BODY, now);
    expect(() =>
      verifySignature({ secret: SECRET, rawBody: BODY, header, nowSeconds: now }),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a tampered body carrying a valid signature for the original", () => {
    // The exact attack the signature exists to stop: keep the signature, change the amount.
    const header = signPayload(SECRET, BODY, now);
    const tampered = JSON.stringify({
      event_type: "payment.captured",
      reference: "sbx_abc",
      amount: 999_999,
    });

    expect(() =>
      verifySignature({ secret: SECRET, rawBody: tampered, header, nowSeconds: now }),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a replayed payload outside the tolerance window", () => {
    const header = signPayload(SECRET, BODY, now - REPLAY_TOLERANCE_SECONDS - 1);
    expect(() =>
      verifySignature({ secret: SECRET, rawBody: BODY, header, nowSeconds: now }),
    ).toThrow(/replay window/);
  });

  it("accepts a payload just inside the tolerance window", () => {
    const header = signPayload(SECRET, BODY, now - REPLAY_TOLERANCE_SECONDS + 1);
    expect(() =>
      verifySignature({ secret: SECRET, rawBody: BODY, header, nowSeconds: now }),
    ).not.toThrow();
  });

  it("rejects a future-dated payload beyond tolerance", () => {
    // Clock skew is bounded in both directions; a far-future timestamp is not legitimate.
    const header = signPayload(SECRET, BODY, now + REPLAY_TOLERANCE_SECONDS + 60);
    expect(() =>
      verifySignature({ secret: SECRET, rawBody: BODY, header, nowSeconds: now }),
    ).toThrow(/replay window/);
  });

  it("rejects a missing signature header", () => {
    expect(() =>
      verifySignature({ secret: SECRET, rawBody: BODY, header: null, nowSeconds: now }),
    ).toThrow(/missing signature header/);
  });

  it("rejects a malformed signature header", () => {
    for (const header of ["garbage", "t=abc,v1=def", "v1=onlysignature", "t=123"]) {
      expect(() =>
        verifySignature({ secret: SECRET, rawBody: BODY, header, nowSeconds: now }),
      ).toThrow(WebhookVerificationError);
    }
  });

  it("rejects verification when no secret is configured", () => {
    // Failing closed matters: an unset secret must not silently accept every webhook.
    const header = signPayload(SECRET, BODY, now);
    expect(() =>
      verifySignature({ secret: "", rawBody: BODY, header, nowSeconds: now }),
    ).toThrow(/no webhook secret/);
  });

  it("rejects a signature of the wrong length without throwing a comparison error", () => {
    // timingSafeEqual throws on a length mismatch; the guard must turn that into a clean
    // verification failure rather than a 500.
    expect(() =>
      verifySignature({ secret: SECRET, rawBody: BODY, header: `t=${now},v1=abcd`, nowSeconds: now }),
    ).toThrow(WebhookVerificationError);
  });

  it("is sensitive to whitespace in the raw body", () => {
    // Proves verification runs against the raw bytes, not a re-serialised object.
    const header = signPayload(SECRET, BODY, now);
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);

    expect(() =>
      verifySignature({ secret: SECRET, rawBody: reserialised, header, nowSeconds: now }),
    ).toThrow(WebhookVerificationError);
  });
});
