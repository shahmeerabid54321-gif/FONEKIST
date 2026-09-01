/**
 * A stand-in for the real payment provider's backend.
 *
 * This exists so the full digital-payment path — session creation, an out-of-band
 * confirmation, a signed webhook, status reconciliation — can be built and tested before a
 * provider contract is signed. It is deliberately NOT a mock inside the tests: the adapter
 * talks to it exactly as it would talk to Safepay or PayFast, so replacing it means
 * rewriting only `service.ts`, not the checkout flow.
 *
 * Not for production: the store is in-process and resets on restart.
 */

export type SandboxPaymentState =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded";

export interface SandboxPayment {
  reference: string;
  sessionId: string;
  amount: number;
  currency: string;
  state: SandboxPaymentState;
  refundedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const payments = new Map<string, SandboxPayment>();

export const sandboxPsp = {
  create(input: { sessionId: string; amount: number; currency: string }): SandboxPayment {
    const reference = `sbx_${Math.random().toString(36).slice(2, 12)}`;
    const now = new Date();
    const payment: SandboxPayment = {
      reference,
      sessionId: input.sessionId,
      amount: input.amount,
      currency: input.currency,
      state: "pending",
      refundedAmount: 0,
      createdAt: now,
      updatedAt: now,
    };
    payments.set(reference, payment);
    return payment;
  },

  get(reference: string): SandboxPayment | null {
    return payments.get(reference) ?? null;
  },

  /** Simulates the customer completing, failing or abandoning payment on the provider's page. */
  transition(reference: string, state: SandboxPaymentState): SandboxPayment {
    const payment = payments.get(reference);
    if (!payment) throw new Error(`Unknown sandbox payment: ${reference}`);
    payment.state = state;
    payment.updatedAt = new Date();
    return payment;
  },

  refund(reference: string, amount: number): SandboxPayment {
    const payment = payments.get(reference);
    if (!payment) throw new Error(`Unknown sandbox payment: ${reference}`);
    payment.refundedAmount += amount;
    payment.state = payment.refundedAmount >= payment.amount ? "refunded" : payment.state;
    payment.updatedAt = new Date();
    return payment;
  },

  /** Test helper. */
  reset(): void {
    payments.clear();
  },
};
