import { installmentDisclosure } from "@pk/contracts";
import { GET } from "../installment-plans/route";

/**
 * The store boundary: a customer is shown amounts, never the shares a plan was authored
 * from (ADR-025, ADR-028).
 *
 * `pricing/` is left out of the vendored contract surface so the storefront cannot import a
 * percentage, but that only covers the FONEKIST bundle. This covers the wire: whatever else
 * changes about how a plan is built, the payload stays cash price, advance, monthly, tenure
 * and total, and nothing that reads as a rate.
 */

const BANNED = /bps|markup|uplift|advance_pct|advance_fraction|rate|interest|apr/i;

const PLAN = {
  id: "iplan_1",
  product_id: "prod_1",
  variant_id: "variant_1",
  label: "12 months",
  advance_pkr: 30_000,
  monthly_pkr: 12_500,
  tenure_months: 12,
  total_payable_pkr: 180_000,
  cash_price_pkr: 120_000,
  active: true,
  active_from: null,
  active_until: null,
  sort_order: 3,
  // Present on the row, and must not survive the projection.
  advance_bps: 2_500,
  markup_bps: 5_000,
};

function requestFor(variantId: string) {
  return {
    query: { variant_id: variantId },
    headers: {},
    scope: { resolve: () => ({ listOfferablePlans: async () => [PLAN] }) },
  } as never;
}

function responseSpy() {
  const captured: { status: number; body: unknown } = { status: 200, body: null };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
    },
  };
  return { res: res as never, captured };
}

describe("GET /store/installment-plans", () => {
  it("returns the disclosure and nothing that reads as a rate", async () => {
    const { res, captured } = responseSpy();
    await GET(requestFor("variant_1"), res);

    const body = captured.body as { data: { plans: Record<string, unknown>[] } };
    const plan = body.data.plans[0]!;

    expect(Object.keys(plan).sort()).toEqual(
      ["id", "label", "variant_id", ...Object.keys(installmentDisclosure(PLAN))].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(BANNED);
  });

  it("refuses to price a plan without a variant", async () => {
    const { res, captured } = responseSpy();
    await GET({ query: {}, headers: {}, scope: { resolve: () => ({}) } } as never, res);

    expect(captured.status).toBe(400);
  });
});
