/**
 * Canonical courier states. Source of truth: 07_SYSTEM_ARCHITECTURE.md section 11.
 * Every provider's vocabulary is normalised onto this list (FUL-003).
 */
export const COURIER_STATES = [
  "pending",
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "returned_to_origin",
  "cancelled",
  "exception",
] as const;

export type CourierState = (typeof COURIER_STATES)[number];

export const TERMINAL_COURIER_STATES: ReadonlySet<CourierState> = new Set<CourierState>([
  "delivered",
  "returned_to_origin",
  "cancelled",
]);

export function isTerminalCourierState(state: CourierState): boolean {
  return TERMINAL_COURIER_STATES.has(state);
}

/**
 * Allowed courier transitions.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 11 lists the states; this is the machine over them.
 *
 * It exists to stop a shipment moving *backwards*, not to demand that every intermediate
 * state be observed. Couriers skip states constantly — a small operator may report nothing
 * between collection and delivery, and a staff member booking by hand has no reason to
 * click through "booked" before recording the tracking number they already have. Requiring
 * the full ladder would only teach operators that the status field lies.
 *
 * What it does refuse is the case that actually causes harm: a stale update arriving after
 * a later one and telling a customer their delivered order is still travelling.
 *
 * `exception` is reachable from every live state and recovers to any of them: an exception
 * is a report about a shipment, not the end of one.
 */
const LIVE_STATES: readonly CourierState[] = [
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "returned_to_origin",
  "cancelled",
];

export const COURIER_TRANSITIONS: Record<CourierState, readonly CourierState[]> = {
  // Nothing is known yet, so the first real observation can be anything.
  pending: ["booked", "picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled", "exception"],
  booked: ["picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled", "exception"],
  // Cancellation stops being available once the courier physically holds the parcel: from
  // here the way back is a return to origin, not a cancellation.
  picked_up: ["in_transit", "out_for_delivery", "delivered", "delivery_failed", "returned_to_origin", "exception"],
  in_transit: ["out_for_delivery", "delivered", "delivery_failed", "returned_to_origin", "exception"],
  out_for_delivery: ["delivered", "delivery_failed", "returned_to_origin", "exception"],
  // A failed attempt is not terminal: couriers reattempt, usually the next working day.
  delivery_failed: ["out_for_delivery", "in_transit", "returned_to_origin", "exception"],
  delivered: [],
  returned_to_origin: [],
  cancelled: [],
  exception: LIVE_STATES,
};

export function canTransitionCourier(from: CourierState, to: CourierState): boolean {
  if (from === to) return true; // A repeated update is not an illegal one.
  return COURIER_TRANSITIONS[from].includes(to);
}
