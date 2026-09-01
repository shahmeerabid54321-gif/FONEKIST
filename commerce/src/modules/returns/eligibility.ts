/**
 * Return eligibility.
 *
 * The rules are here, as pure functions, rather than inline in the endpoint: they decide
 * whether a customer can send goods back, they are a published promise, and they need to be
 * testable without a database or an order.
 *
 * The window itself is a merchant setting and an open business decision (PRD section 11) —
 * it is read from configuration, not hard-coded, and the storefront states the same figure.
 */

export const RETURN_REASON_CODES = [
  "damaged_in_transit",
  "wrong_item",
  "not_as_described",
  "faulty",
  "changed_mind",
  "missing_parts",
] as const;

export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number];

export const RETURN_REASON_LABEL: Record<ReturnReasonCode, string> = {
  damaged_in_transit: "Arrived damaged",
  wrong_item: "Wrong item sent",
  not_as_described: "Not as described",
  faulty: "Faulty or not working",
  changed_mind: "Changed my mind",
  missing_parts: "Missing parts or accessories",
};

export function returnWindowDays(): number {
  const days = Number(process.env.RETURN_WINDOW_DAYS ?? 7);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
}

export interface EligibilityInput {
  /** When the order was delivered. Null when it has not been delivered yet. */
  deliveredAt: Date | null;
  orderCancelled: boolean;
  /** Quantities already covered by an open or approved request, keyed by order line. */
  alreadyRequested: Record<string, number>;
  /** Quantities on the order, keyed by order line. */
  ordered: Record<string, number>;
  requested: { orderLineId: string; quantity: number }[];
  now?: Date;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string; code: "not_delivered" | "window_closed" | "cancelled" | "quantity" };

export function checkReturnEligibility(input: EligibilityInput): EligibilityResult {
  if (input.orderCancelled) {
    return {
      eligible: false,
      code: "cancelled",
      reason: "This order was cancelled, so there is nothing to return.",
    };
  }

  if (!input.deliveredAt) {
    // Before delivery the right action is cancelling, not returning — telling someone to
    // post back goods they have not received would be absurd.
    return {
      eligible: false,
      code: "not_delivered",
      reason: "This order has not been delivered yet. Contact us if you want to cancel it.",
    };
  }

  const days = returnWindowDays();
  const deadline = new Date(input.deliveredAt.getTime() + days * 24 * 60 * 60 * 1000);

  if ((input.now ?? new Date()).getTime() > deadline.getTime()) {
    return {
      eligible: false,
      code: "window_closed",
      reason: `The ${days}-day return window for this order closed on ${deadline.toISOString().slice(0, 10)}.`,
    };
  }

  for (const line of input.requested) {
    const ordered = input.ordered[line.orderLineId] ?? 0;
    const already = input.alreadyRequested[line.orderLineId] ?? 0;

    if (ordered === 0) {
      return { eligible: false, code: "quantity", reason: "That item is not on this order." };
    }

    // Counting existing requests is what stops the same unit being returned twice by
    // submitting the form again.
    if (line.quantity + already > ordered) {
      return {
        eligible: false,
        code: "quantity",
        reason: `You have already requested a return for ${already} of ${ordered}. You can return ${ordered - already} more.`,
      };
    }
  }

  return { eligible: true };
}
