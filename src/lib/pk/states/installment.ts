/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/states/installment.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

/**
 * Installment application states. Source of truth: ADR-023.
 *
 * Modelled exactly like `cod.ts`: a closed set of states and an explicit transition table,
 * so an illegal move is a rejected call rather than a row quietly in the wrong state.
 *
 * The states that matter operationally are the ones the original design left undefined.
 * `expired` exists because an application nobody reviews still holds reserved stock, and
 * stock held forever by an abandoned application is indistinguishable from stock that was
 * sold.
 */
export const INSTALLMENT_STATES = [
  "draft",
  "submitted",
  "under_review",
  "more_information_required",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "handed_off",
] as const;

export type InstallmentState = (typeof INSTALLMENT_STATES)[number];

export const INSTALLMENT_TRANSITIONS: Record<InstallmentState, readonly InstallmentState[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled", "expired"],
  under_review: ["approved", "rejected", "more_information_required", "cancelled", "expired"],
  // The customer supplies what was asked for and it goes back into the queue. This is the
  // only cycle in the machine, and it is deliberate: rejecting an application because a
  // photograph was blurry helps nobody.
  more_information_required: ["under_review", "cancelled", "expired"],
  approved: ["handed_off", "cancelled"],
  rejected: [],
  cancelled: [],
  expired: [],
  handed_off: [],
};

export function canTransitionInstallment(from: InstallmentState, to: InstallmentState): boolean {
  return INSTALLMENT_TRANSITIONS[from].includes(to);
}

/**
 * States where the application still holds a stock reservation.
 *
 * A reservation exists to stop the last unit being sold to somebody else while a human
 * decides. The moment the answer is no, or nobody is deciding any more, it must be
 * released — this is the predicate the release job runs on.
 */
export function holdsReservation(state: InstallmentState): boolean {
  return state === "submitted" || state === "under_review" || state === "more_information_required";
}

/** Terminal states: nothing further happens without a new application. */
export function isTerminalInstallment(state: InstallmentState): boolean {
  return INSTALLMENT_TRANSITIONS[state].length === 0;
}

/**
 * Customer-facing wording. Deliberately plain and never optimistic: "under review" does
 * not become "almost there", and a rejection is not softened into something that reads
 * like a delay.
 */
export const INSTALLMENT_STATE_LABEL: Record<InstallmentState, string> = {
  draft: "Not submitted",
  submitted: "Received",
  under_review: "Under review",
  more_information_required: "More information needed",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
  expired: "Expired",
  handed_off: "Approved and being arranged",
};
