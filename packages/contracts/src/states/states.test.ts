import { describe, expect, it } from "vitest";
import {
  canTransitionCod,
  canTransitionCourier,
  COURIER_STATES,
  canTransitionPayment,
  deriveTrackingState,
  isFulfillableCod,
  isPaid,
  PAYMENT_STATES,
  PAYMENT_TRANSITIONS,
  TERMINAL_PAYMENT_STATES,
} from "./index.js";

describe("payment state machine", () => {
  it("permits the normal online payment path", () => {
    expect(canTransitionPayment("not_started", "pending")).toBe(true);
    expect(canTransitionPayment("pending", "authorized")).toBe(true);
    expect(canTransitionPayment("authorized", "captured")).toBe(true);
    expect(canTransitionPayment("captured", "refunded")).toBe(true);
  });

  it("refuses to resurrect a refunded payment (ADR-007 replay protection)", () => {
    // A replayed or out-of-order provider webhook must not move money back to captured.
    expect(canTransitionPayment("refunded", "captured")).toBe(false);
    expect(canTransitionPayment("refunded", "authorized")).toBe(false);
    expect(canTransitionPayment("refunded", "pending")).toBe(false);
  });

  it("treats cancelled as fully terminal", () => {
    expect(PAYMENT_TRANSITIONS.cancelled).toHaveLength(0);
    for (const state of PAYMENT_STATES) {
      expect(canTransitionPayment("cancelled", state)).toBe(false);
    }
  });

  it("never allows a direct jump from not_started to captured", () => {
    // Skipping straight to captured is how a forged webhook would try to fake a payment.
    expect(canTransitionPayment("not_started", "captured")).toBe(false);
    expect(canTransitionPayment("not_started", "authorized")).toBe(false);
  });

  it("counts only settled states as paid", () => {
    expect(isPaid("captured")).toBe(true);
    expect(isPaid("partially_refunded")).toBe(true);
    expect(isPaid("authorized")).toBe(false);
    expect(isPaid("pending")).toBe(false);
    expect(isPaid("failed")).toBe(false);
  });

  it("declares the expected terminal states", () => {
    expect([...TERMINAL_PAYMENT_STATES].sort()).toEqual(["cancelled", "refunded"]);
  });
});

describe("COD state machine", () => {
  it("requires confirmation before fulfilment (PAY-005)", () => {
    expect(isFulfillableCod("cod_pending_confirmation")).toBe(false);
    expect(isFulfillableCod("cod_confirmed")).toBe(true);
    expect(isFulfillableCod("cod_rejected")).toBe(false);
  });

  it("cannot un-reject a rejected COD order", () => {
    expect(canTransitionCod("cod_rejected", "cod_confirmed")).toBe(false);
  });

  it("allows rejection after confirmation but before shipping", () => {
    expect(canTransitionCod("cod_confirmed", "cod_rejected")).toBe(true);
    expect(canTransitionCod("cod_shipped", "cod_rejected")).toBe(false);
  });
});

describe("customer-facing tracking projection", () => {
  it("shows order received for an unconfirmed COD order", () => {
    expect(
      deriveTrackingState({ paymentState: "pending", codState: "cod_pending_confirmation" }),
    ).toBe("order_received");
  });

  it("shows confirmed once COD is confirmed", () => {
    expect(deriveTrackingState({ paymentState: "pending", codState: "cod_confirmed" })).toBe(
      "confirmed",
    );
  });

  it("shows confirmed once an online payment is captured", () => {
    expect(deriveTrackingState({ paymentState: "captured" })).toBe("confirmed");
  });

  it("does not advance past order received while payment is unresolved", () => {
    expect(deriveTrackingState({ paymentState: "pending" })).toBe("order_received");
  });

  it("prefers refunded over any shipping state", () => {
    // "Delivered" is technically true but "Refunded" is what the customer needs to see.
    expect(
      deriveTrackingState({ paymentState: "refunded", courierState: "delivered" }),
    ).toBe("refunded");
  });

  it("keeps a failed delivery attempt at out for delivery", () => {
    // The courier will reattempt; regressing the headline to "Shipped" would read as a bug.
    expect(
      deriveTrackingState({ paymentState: "captured", courierState: "delivery_failed" }),
    ).toBe("out_for_delivery");
  });

  it("maps a return to origin onto return in progress", () => {
    expect(
      deriveTrackingState({ paymentState: "captured", courierState: "returned_to_origin" }),
    ).toBe("return_in_progress");
  });

  it("treats a rejected COD order as cancelled", () => {
    expect(deriveTrackingState({ paymentState: "pending", codState: "cod_rejected" })).toBe(
      "cancelled",
    );
  });

  it("ignores an unmappable courier state and falls back to payment", () => {
    expect(
      deriveTrackingState({ paymentState: "captured", courierState: "exception" }),
    ).toBe("confirmed");
  });
});

describe("courier transitions", () => {
  it("lets a shipment progress through the normal path", () => {
    expect(canTransitionCourier("pending", "booked")).toBe(true);
    expect(canTransitionCourier("booked", "picked_up")).toBe(true);
    expect(canTransitionCourier("picked_up", "in_transit")).toBe(true);
    expect(canTransitionCourier("in_transit", "out_for_delivery")).toBe(true);
    expect(canTransitionCourier("out_for_delivery", "delivered")).toBe(true);
  });

  it("lets a shipment skip states, because couriers do", () => {
    // A small operator may report nothing between collection and delivery, and staff
    // booking by hand have the tracking number before they have anything to click through.
    expect(canTransitionCourier("pending", "in_transit")).toBe(true);
    expect(canTransitionCourier("booked", "delivered")).toBe(true);
    expect(canTransitionCourier("picked_up", "delivered")).toBe(true);
  });

  it("stops cancelling a parcel the courier already holds", () => {
    // Once it is collected the way back is a return to origin, not a cancellation.
    expect(canTransitionCourier("booked", "cancelled")).toBe(true);
    expect(canTransitionCourier("picked_up", "cancelled")).toBe(false);
    expect(canTransitionCourier("picked_up", "returned_to_origin")).toBe(true);
  });

  it("refuses to move a shipment backwards out of a terminal state", () => {
    // The case this exists for: a webhook retried out of order, or an operator catching up
    // by hand, telling a customer their delivered order is still travelling.
    expect(canTransitionCourier("delivered", "in_transit")).toBe(false);
    expect(canTransitionCourier("delivered", "out_for_delivery")).toBe(false);
    expect(canTransitionCourier("returned_to_origin", "in_transit")).toBe(false);
    expect(canTransitionCourier("cancelled", "booked")).toBe(false);
  });

  it("treats a repeated update as legal, because duplicates are expected", () => {
    for (const state of COURIER_STATES) {
      expect(canTransitionCourier(state, state)).toBe(true);
    }
  });

  it("allows a failed delivery to be reattempted", () => {
    expect(canTransitionCourier("out_for_delivery", "delivery_failed")).toBe(true);
    expect(canTransitionCourier("delivery_failed", "out_for_delivery")).toBe(true);
    expect(canTransitionCourier("delivery_failed", "returned_to_origin")).toBe(true);
  });

  it("lets an exception be raised from any live state and recovered from", () => {
    expect(canTransitionCourier("in_transit", "exception")).toBe(true);
    expect(canTransitionCourier("exception", "in_transit")).toBe(true);
    expect(canTransitionCourier("exception", "delivered")).toBe(true);
  });
});
