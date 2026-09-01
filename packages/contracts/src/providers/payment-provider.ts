import type { PaymentState } from "../states/payment.js";

/**
 * Payment provider contract. Source of truth: 02_TRD.md section 6 and ADR-006.
 *
 * ADR-011 / SEC-001: no implementation of this interface may accept, return, persist or
 * log a raw PAN or CVV. Card data lives only on the provider's own payment surface.
 */

/** Money is integer minor units to keep arithmetic exact. PKR has no subunit in practice. */
export interface Money {
  amount: number;
  currency: "PKR";
}

export interface CreatePaymentSession {
  /** Commerce-side payment id; the stable key we reconcile against. */
  paymentId: string;
  cartId: string;
  orderReference: string;
  amount: Money;
  customer: {
    /** Pseudonymous id; never send raw email/phone to analytics (08_DATA_MODEL section 15). */
    id: string | null;
    email?: string;
    phone?: string;
  };
  /** Where the provider sends the browser back. UX only — never payment truth (ADR-007). */
  returnUrl: string;
  cancelUrl: string;
  /** Mandatory: this call is a duplicate-risk write (TRD section 7). */
  idempotencyKey: string;
}

export interface PaymentSession {
  providerReference: string;
  state: PaymentState;
  /** Redirect target, when the provider hosts the payment surface. */
  redirectUrl?: string;
  /** Opaque data for an embedded provider widget. Never card data. */
  clientPayload?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface PaymentStatus {
  providerReference: string;
  state: PaymentState;
  amount: Money;
  /** Provider's own wording, kept for support/debugging only. */
  providerStatusRaw?: string;
  updatedAt: Date;
}

export interface RefundPayment {
  paymentId: string;
  providerReference: string;
  amount: Money;
  reason?: string;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundReference: string;
  state: PaymentState;
  refunded: Money;
}

/** Result of verifying an inbound webhook. Never trust an unverified body (architecture section 15). */
export interface VerifiedPaymentEvent {
  /** Provider event id, used to deduplicate replays (API contract section 7 step 5). */
  eventId: string;
  providerReference: string;
  state: PaymentState;
  amount: Money;
  occurredAt: Date;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: string;
  readonly displayName: string;
  /** False for offline methods such as COD, which have no provider session or webhook. */
  readonly isOnline: boolean;

  createSession(input: CreatePaymentSession): Promise<PaymentSession>;
  getStatus(providerReference: string): Promise<PaymentStatus>;
  refund(input: RefundPayment): Promise<RefundResult>;
  /** Throws AppError("FORBIDDEN") on an invalid signature — it must mutate nothing (PAY-001). */
  verifyWebhook(headers: Headers, rawBody: string): VerifiedPaymentEvent;
}
