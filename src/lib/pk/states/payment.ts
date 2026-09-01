/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/states/payment.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

/**
 * Canonical payment states. Source of truth: 07_SYSTEM_ARCHITECTURE.md section 9.
 * Provider-specific states map onto these; provider vocabulary never leaks into the domain.
 */
export const PAYMENT_STATES = [
  "not_started",
  "pending",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
  "disputed",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

/**
 * Allowed transitions. A webhook may only move a payment along one of these edges
 * (API contract section 7 step 7); anything else is rejected and logged rather than
 * silently applied, which is what stops a replayed or out-of-order provider event from
 * resurrecting a refunded payment.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  not_started: ["pending", "failed", "cancelled"],
  pending: ["authorized", "captured", "failed", "cancelled", "pending"],
  authorized: ["captured", "cancelled", "failed", "disputed"],
  captured: ["partially_refunded", "refunded", "disputed"],
  partially_refunded: ["refunded", "disputed"],
  refunded: ["disputed"],
  failed: ["pending"],
  cancelled: [],
  disputed: ["refunded", "captured"],
};

/** States in which money is settled with the merchant. */
export const PAID_STATES: ReadonlySet<PaymentState> = new Set<PaymentState>([
  "captured",
  "partially_refunded",
]);

/** Terminal states: no further provider event should change them. */
export const TERMINAL_PAYMENT_STATES: ReadonlySet<PaymentState> = new Set<PaymentState>([
  "cancelled",
  "refunded",
]);

/**
 * States needing active reconciliation against the provider (PAY-002). A payment left in
 * one of these past its grace window is polled via `PaymentProvider.getStatus`.
 */
export const RECONCILABLE_PAYMENT_STATES: ReadonlySet<PaymentState> = new Set<PaymentState>([
  "pending",
  "authorized",
]);

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function isPaid(state: PaymentState): boolean {
  return PAID_STATES.has(state);
}
