import InstallmentPaymentProviderService from "../service";

/**
 * The installment provider's whole job is to refuse to say a sale has happened.
 *
 * These tests assert the refusals rather than the happy path, because every one of them is
 * a way the order and revenue figures could silently become wrong.
 */

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function provider(maxOrderValuePkr = 500_000) {
  return new InstallmentPaymentProviderService(
    { logger } as never,
    { maxOrderValuePkr },
  );
}

const snapshot = {
  plan_id: "iplan_1",
  label: "12 months",
  advance_pkr: 90_000,
  monthly_pkr: 32_500,
  tenure_months: 12,
  total_payable_pkr: 480_000,
  cash_price_pkr: 424_999,
  difference_pkr: 55_001,
  terms_version: "2026-08-27",
  snapshotted_at: new Date().toISOString(),
};

describe("authorizePayment", () => {
  it("defers authorisation instead of authorising", async () => {
    // The single most important assertion in the module. `authorized` here would mean an
    // agreed sale against stock we would have to honour, at a price nobody underwrote.
    const result = await provider().authorizePayment({ data: {} } as never);
    expect(result.status).toBe("pending_authorization");
    expect(result.status).not.toBe("authorized");
    expect(result.status).not.toBe("captured");
  });

  it("uses pending_authorization, not plain pending", async () => {
    // Not a cosmetic difference: Medusa treats `pending_authorization` as deferred
    // authorisation and lets cart completion proceed with no payment record, whereas plain
    // `pending` raises PAYMENT_AUTHORIZATION_ERROR and the customer cannot submit at all.
    const result = await provider().authorizePayment({ data: {} } as never);
    expect(result.status).toBe("pending_authorization");
  });
});

describe("initiatePayment", () => {
  it("refuses a session with no agreed plan attached", async () => {
    // The snapshot is the terms the customer agreed to. Without it there is nothing to hold
    // the sale to, and the order would carry no record of what was promised.
    await expect(
      provider().initiatePayment({
        amount: 424_999,
        currency_code: "pkr",
        data: {},
      } as never),
    ).rejects.toThrow(/agreed plan/i);
  });

  it("refuses an order above the merchant ceiling", async () => {
    await expect(
      provider(300_000).initiatePayment({
        amount: 424_999,
        currency_code: "pkr",
        data: { installment_snapshot: snapshot },
      } as never),
    ).rejects.toThrow(/up to Rs/);
  });

  it("records the snapshot on the session", async () => {
    const result = await provider().initiatePayment({
      amount: 424_999,
      currency_code: "pkr",
      data: { installment_snapshot: snapshot },
    } as never);
    expect(result.data?.installment_snapshot).toEqual(snapshot);
    expect(result.data?.approved).toBe(false);
  });
});

describe("capture and refund", () => {
  it("never captures", async () => {
    // Money is collected off-site. A capture here would put revenue in the books that
    // nobody has received.
    await expect(provider().capturePayment({ data: {} } as never)).rejects.toThrow(
      /never captured/i,
    );
  });

  it("never refunds", async () => {
    await expect(
      provider().refundPayment({ data: {}, amount: 1000 } as never),
    ).rejects.toThrow(/nothing to refund/i);
  });
});

describe("getPaymentStatus", () => {
  it("stays deferred until a human approval is written", async () => {
    const status = await provider().getPaymentStatus({
      data: { installment_snapshot: snapshot, approved: false },
    } as never);
    expect(status.status).toBe("pending_authorization");
  });

  it("authorises only on the approved flag", async () => {
    const status = await provider().getPaymentStatus({
      data: { installment_snapshot: snapshot, approved: true },
    } as never);
    expect(status.status).toBe("authorized");
    // Still not captured: no money reaches us through this provider, ever.
    expect(status.status).not.toBe("captured");
  });

  it("ignores anything a browser could have put in the session", async () => {
    // ADR-007: a redirect is never payment truth. Only `approved`, written by the admin
    // decision route, moves this forward.
    const status = await provider().getPaymentStatus({
      data: {
        installment_snapshot: snapshot,
        approved: false,
        status: "authorized",
        paid: true,
        success: "true",
        installment_state: "installment_approved",
      },
    } as never);
    expect(status.status).toBe("pending_authorization");
  });

  it("reports a cancelled application as cancelled", async () => {
    const status = await provider().getPaymentStatus({
      data: { installment_state: "installment_cancelled" },
    } as never);
    expect(status.status).toBe("canceled");
  });
});

describe("webhooks", () => {
  it("refuses to act on any payload", async () => {
    // There is no third party. An endpoint that accepted something here would be an
    // unauthenticated way to approve credit.
    await expect(provider().getWebhookActionAndData({} as never)).resolves.toEqual({
      action: "not_supported",
    });
  });
});

describe("validateOptions", () => {
  it("refuses a missing or nonsensical ceiling", () => {
    expect(() => InstallmentPaymentProviderService.validateOptions({})).toThrow();
    expect(() => InstallmentPaymentProviderService.validateOptions({ maxOrderValuePkr: 0 })).toThrow();
    expect(() =>
      InstallmentPaymentProviderService.validateOptions({ maxOrderValuePkr: 500_000 }),
    ).not.toThrow();
  });
});
