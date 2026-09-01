import { describe, expect, it } from "vitest";
import {
  INSTALLMENT_STATES,
  INSTALLMENT_TRANSITIONS,
  canTransitionInstallment,
  holdsReservation,
  isTerminalInstallment,
  type InstallmentState,
} from "./installment.js";

describe("installment state machine", () => {
  it("allows exactly the transitions in the table and nothing else", () => {
    // Enumerating every pair rather than spot-checking: the failure this guards against is
    // a state reachable by accident, and a spot check cannot see one.
    for (const from of INSTALLMENT_STATES) {
      for (const to of INSTALLMENT_STATES) {
        const legal = INSTALLMENT_TRANSITIONS[from].includes(to);
        expect(canTransitionInstallment(from, to)).toBe(legal);
      }
    }
  });

  it("cannot reopen a decided application", () => {
    const decided: InstallmentState[] = ["approved", "rejected", "cancelled", "expired"];
    for (const state of decided) {
      expect(canTransitionInstallment(state, "under_review")).toBe(false);
      expect(canTransitionInstallment(state, "submitted")).toBe(false);
    }
  });

  it("cannot approve an application that was never reviewed", () => {
    expect(canTransitionInstallment("submitted", "approved")).toBe(false);
    expect(canTransitionInstallment("draft", "approved")).toBe(false);
  });

  it("lets a request for information return to review", () => {
    expect(canTransitionInstallment("under_review", "more_information_required")).toBe(true);
    expect(canTransitionInstallment("more_information_required", "under_review")).toBe(true);
  });

  it("holds a reservation only while a decision is still pending", () => {
    expect(holdsReservation("submitted")).toBe(true);
    expect(holdsReservation("under_review")).toBe(true);
    expect(holdsReservation("more_information_required")).toBe(true);
    // Every outcome releases the stock. A reservation held past a decision is a unit that
    // cannot be sold and that nobody is buying.
    expect(holdsReservation("approved")).toBe(false);
    expect(holdsReservation("rejected")).toBe(false);
    expect(holdsReservation("cancelled")).toBe(false);
    expect(holdsReservation("expired")).toBe(false);
  });

  it("marks the outcome states terminal", () => {
    expect(isTerminalInstallment("rejected")).toBe(true);
    expect(isTerminalInstallment("expired")).toBe(true);
    expect(isTerminalInstallment("handed_off")).toBe(true);
    expect(isTerminalInstallment("under_review")).toBe(false);
  });
});
