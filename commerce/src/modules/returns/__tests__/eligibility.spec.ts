import { checkReturnEligibility, returnWindowDays } from "../eligibility";

const DELIVERED = new Date("2026-08-01T10:00:00Z");

function base(overrides: Partial<Parameters<typeof checkReturnEligibility>[0]> = {}) {
  return {
    deliveredAt: DELIVERED,
    orderCancelled: false,
    alreadyRequested: {},
    ordered: { line_1: 2 },
    requested: [{ orderLineId: "line_1", quantity: 1 }],
    now: new Date("2026-08-03T10:00:00Z"),
    ...overrides,
  };
}

describe("return eligibility", () => {
  const originalWindow = process.env.RETURN_WINDOW_DAYS;
  afterEach(() => {
    if (originalWindow === undefined) delete process.env.RETURN_WINDOW_DAYS;
    else process.env.RETURN_WINDOW_DAYS = originalWindow;
  });

  it("allows a return inside the window", () => {
    expect(checkReturnEligibility(base())).toEqual({ eligible: true });
  });

  it("refuses a return before delivery, and says to cancel instead", () => {
    const result = checkReturnEligibility(base({ deliveredAt: null }));

    expect(result.eligible).toBe(false);
    // Telling someone to post back goods they have not received would be absurd.
    expect(result).toMatchObject({ code: "not_delivered" });
    if (!result.eligible) expect(result.reason).toContain("cancel");
  });

  it("refuses a cancelled order", () => {
    expect(checkReturnEligibility(base({ orderCancelled: true }))).toMatchObject({
      eligible: false,
      code: "cancelled",
    });
  });

  it("closes the window after the configured number of days", () => {
    process.env.RETURN_WINDOW_DAYS = "7";

    // Day 7 is still inside.
    expect(checkReturnEligibility(base({ now: new Date("2026-08-08T09:00:00Z") }))).toEqual({
      eligible: true,
    });
    expect(
      checkReturnEligibility(base({ now: new Date("2026-08-09T10:00:00Z") })),
    ).toMatchObject({ eligible: false, code: "window_closed" });
  });

  it("takes the window from configuration rather than a constant", () => {
    process.env.RETURN_WINDOW_DAYS = "30";
    expect(returnWindowDays()).toBe(30);

    expect(checkReturnEligibility(base({ now: new Date("2026-08-20T10:00:00Z") }))).toEqual({
      eligible: true,
    });
  });

  it("falls back to a sane window when configuration is nonsense", () => {
    process.env.RETURN_WINDOW_DAYS = "-3";
    expect(returnWindowDays()).toBe(7);
  });

  it("refuses more than was ordered", () => {
    expect(
      checkReturnEligibility(base({ requested: [{ orderLineId: "line_1", quantity: 3 }] })),
    ).toMatchObject({ eligible: false, code: "quantity" });
  });

  it("counts quantities already covered by an open request", () => {
    // The case this exists for: submitting the form twice to return the same unit.
    expect(
      checkReturnEligibility(base({ alreadyRequested: { line_1: 2 } })),
    ).toMatchObject({ eligible: false, code: "quantity" });

    expect(checkReturnEligibility(base({ alreadyRequested: { line_1: 1 } }))).toEqual({
      eligible: true,
    });
  });

  it("refuses an item that is not on the order", () => {
    expect(
      checkReturnEligibility(base({ requested: [{ orderLineId: "line_other", quantity: 1 }] })),
    ).toMatchObject({ eligible: false, code: "quantity" });
  });
});
