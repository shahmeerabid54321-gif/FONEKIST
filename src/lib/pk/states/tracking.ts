/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/states/tracking.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

import type { CourierState } from "./courier";
import type { CodState } from "./cod";
import type { PaymentState } from "./payment";

/**
 * Customer-facing order states. Source of truth: 05_UX_DESIGN_SPEC.md section 10.
 * Raw carrier wording may be shown as secondary detail but never as the headline state.
 */
export const TRACKING_STATES = [
  "order_received",
  "confirmed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "return_in_progress",
  "refunded",
] as const;

export type TrackingState = (typeof TRACKING_STATES)[number];

export const TRACKING_STATE_LABEL: Record<TrackingState, string> = {
  order_received: "Order received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_in_progress: "Return in progress",
  refunded: "Refunded",
};

/** Happy-path order used to render the timeline; branch states are shown in place. */
export const TRACKING_TIMELINE: readonly TrackingState[] = [
  "order_received",
  "confirmed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

const COURIER_TO_TRACKING: Record<CourierState, TrackingState | null> = {
  pending: null,
  booked: "preparing",
  picked_up: "shipped",
  in_transit: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  // A failed attempt is not a customer-visible regression to "shipped"; the courier will
  // reattempt, so the headline stays "out for delivery" with the raw reason as detail.
  delivery_failed: "out_for_delivery",
  returned_to_origin: "return_in_progress",
  cancelled: "cancelled",
  exception: null,
};

export interface TrackingInput {
  paymentState: PaymentState;
  codState?: CodState | null;
  courierState?: CourierState | null;
  cancelled?: boolean;
  returnInProgress?: boolean;
}

/**
 * Derives the single customer-facing state. Terminal money states win over shipping
 * states, because "Refunded" is more truthful to the customer than "Delivered" once a
 * refund has completed.
 */
export function deriveTrackingState(input: TrackingInput): TrackingState {
  if (input.paymentState === "refunded") return "refunded";
  if (input.cancelled || input.paymentState === "cancelled" || input.codState === "cod_rejected") {
    return "cancelled";
  }
  if (input.returnInProgress) return "return_in_progress";

  if (input.courierState) {
    const mapped = COURIER_TO_TRACKING[input.courierState];
    if (mapped) return mapped;
  }

  // No shipment yet: confirmation depends on how the order is being paid for.
  if (input.codState) {
    return input.codState === "cod_pending_confirmation" ? "order_received" : "confirmed";
  }
  if (input.paymentState === "captured" || input.paymentState === "authorized") return "confirmed";
  return "order_received";
}
