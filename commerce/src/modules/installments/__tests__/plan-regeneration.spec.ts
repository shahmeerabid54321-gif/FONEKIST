import { DEFAULT_INSTALLMENT_RULES, type InstallmentRule } from "@pk/contracts";
import InstallmentsService, { type PlanRow, type RuleRow } from "../service";

/**
 * Regeneration, against in-memory tables.
 *
 * The generated CRUD is replaced with plain arrays rather than mocked call-by-call, because
 * what these tests are about is the *state* the reconciliation leaves behind — which row
 * kept its id, which one was switched off — and that is invisible in a list of calls.
 *
 * The property that matters most here is id stability. A plan id sits in the URL of an
 * application somebody is filling in and in `installment_application.plan_id` on every
 * application already submitted. A reconciliation that deleted and recreated would break
 * both, silently, and only for the customers who were mid-application at the time.
 */

interface Fixture {
  service: InstallmentsService;
  plans: PlanRow[];
  rules: RuleRow[];
}

const PRODUCT = "prod_1";
const VARIANT = "variant_1";

function fixture(rules: Partial<RuleRow>[] = []): Fixture {
  const plans: PlanRow[] = [];
  const ruleRows: RuleRow[] = rules.map((rule, index) => ({
    id: `irule_${index}`,
    scope: "product",
    scope_id: PRODUCT,
    tenure_months: 12,
    advance_bps: 2_500,
    markup_bps: 5_000,
    active: true,
    updated_by: null,
    sort_order: index,
    ...rule,
  }));

  const service = new (InstallmentsService as never as new (c: unknown) => InstallmentsService)({});
  let nextId = 0;

  Object.assign(service, {
    listInstallmentPlans: async (filters: { variant_id?: string }) =>
      plans.filter((plan) => !filters.variant_id || plan.variant_id === filters.variant_id),
    retrieveInstallmentPlan: async (id: string) => plans.find((plan) => plan.id === id) ?? null,
    createInstallmentPlans: async (input: Omit<PlanRow, "id">) => {
      const row = { id: `iplan_${nextId++}`, ...input };
      plans.push(row);
      return row;
    },
    updateInstallmentPlans: async ({
      selector,
      data,
    }: {
      selector: { id: string };
      data: Partial<PlanRow>;
    }) => {
      const row = plans.find((plan) => plan.id === selector.id);
      if (row) Object.assign(row, data);
      return row;
    },
    listInstallmentRules: async () => ruleRows,
  });

  return { service, plans, rules: ruleRows };
}

const byTenure = (plans: PlanRow[], tenure: number): PlanRow | undefined =>
  plans.find((plan) => plan.tenure_months === tenure);

describe("regeneratePlansFor", () => {
  it("writes the default schedule for a variant that has none", async () => {
    const { service, plans } = fixture();

    const result = await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);

    expect(result).toEqual({ created: 4, updated: 0, deactivated: 0 });
    expect(plans).toHaveLength(4);
    expect(byTenure(plans, 12)).toMatchObject({
      advance_pkr: 30_000,
      monthly_pkr: 12_500,
      total_payable_pkr: 180_000,
      cash_price_pkr: 120_000,
      active: true,
    });
  });

  it("keeps a plan's id when the schedule changes", async () => {
    const { service, plans, rules } = fixture();
    await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);
    const before = plans.map((plan) => plan.id).sort();

    rules.push({
      id: "irule_new",
      scope: "product",
      scope_id: PRODUCT,
      tenure_months: 12,
      advance_bps: 3_000,
      markup_bps: 4_000,
      active: true,
      updated_by: "admin",
      sort_order: 0,
    });
    const result = await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);

    expect(result).toEqual({ created: 0, updated: 4, deactivated: 0 });
    expect(plans.map((plan) => plan.id).sort()).toEqual(before);
    // 30% advance, 40% markup on Rs 120,000: 36,000 up front, 132,000 over 12 months.
    expect(byTenure(plans, 12)).toMatchObject({ advance_pkr: 36_000, monthly_pkr: 11_000 });
  });

  it("withdraws a tenure by deactivating it, never by deleting it", async () => {
    const { service, plans, rules } = fixture();
    await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);
    const withdrawnId = byTenure(plans, 12)!.id;

    rules.push({
      id: "irule_off",
      scope: "product",
      scope_id: PRODUCT,
      tenure_months: 12,
      advance_bps: 2_500,
      markup_bps: 5_000,
      active: false,
      updated_by: "admin",
      sort_order: 0,
    });
    const result = await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);

    expect(result).toEqual({ created: 0, updated: 3, deactivated: 1 });
    expect(plans).toHaveLength(4);
    // Still retrievable: this is what lets an application that references it be answered
    // with "no longer available" instead of a fault, and what keeps the reservation and
    // purge jobs working against applications already submitted.
    expect(await service.retrieveInstallmentPlan(withdrawnId)).toMatchObject({ active: false });
  });

  it("reuses the same row when a withdrawn tenure comes back", async () => {
    const { service, plans, rules } = fixture([{ tenure_months: 12, active: false }]);
    await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);
    expect(plans).toHaveLength(3);

    rules[0]!.active = true;
    await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);

    expect(plans).toHaveLength(4);
    expect(byTenure(plans, 12)).toMatchObject({ active: true });
  });

  it("takes every plan off a handset that has been repriced below the minimum", async () => {
    const { service, plans } = fixture();
    await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);

    const result = await service.regeneratePlansFor(PRODUCT, VARIANT, 30_000);

    expect(result).toEqual({ created: 0, updated: 0, deactivated: 4 });
    expect(plans.every((plan) => !plan.active)).toBe(true);
  });

  it("rewrites the snapshotted cash price when the handset is repriced", async () => {
    const { service, plans } = fixture();
    await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);
    await service.regeneratePlansFor(PRODUCT, VARIANT, 150_000);

    expect(plans.every((plan) => plan.cash_price_pkr === 150_000)).toBe(true);
    expect(byTenure(plans, 12)).toMatchObject({ advance_pkr: 38_000, monthly_pkr: 15_600 });
  });
});

describe("upsertPlan", () => {
  it("refuses a plan with no schedule to pay", async () => {
    const { service } = fixture();

    await expect(
      service.upsertPlan({
        product_id: PRODUCT,
        variant_id: VARIANT,
        label: "12 months",
        advance_pkr: 120_000,
        monthly_pkr: 0,
        tenure_months: 12,
        total_payable_pkr: 120_000,
        cash_price_pkr: 120_000,
        active: true,
        active_from: null,
        active_until: null,
        sort_order: 0,
      }),
    ).rejects.toThrow(/above zero/);
  });

  it("still refuses a total that disagrees with its own arithmetic", async () => {
    const { service } = fixture();

    await expect(
      service.upsertPlan({
        product_id: PRODUCT,
        variant_id: VARIANT,
        label: "12 months",
        advance_pkr: 30_000,
        monthly_pkr: 12_500,
        tenure_months: 12,
        total_payable_pkr: 179_999,
        cash_price_pkr: 120_000,
        active: true,
        active_from: null,
        active_until: null,
        sort_order: 0,
      }),
    ).rejects.toThrow(/advance plus monthly times tenure/);
  });
});

describe("minimumsByProduct", () => {
  it("ignores a plan with no monthly figure rather than advertising Rs 0 a month", async () => {
    const { service, plans } = fixture();
    await service.regeneratePlansFor(PRODUCT, VARIANT, 120_000);
    // Only reachable through a row that predates the write-path guard, which is exactly the
    // case the read path has to survive.
    byTenure(plans, 12)!.monthly_pkr = 0;
    byTenure(plans, 12)!.product_id = PRODUCT;

    Object.assign(service, { listInstallmentPlans: async () => plans });
    const minimums = await service.minimumsByProduct([PRODUCT]);

    expect(minimums[PRODUCT]!.min_monthly_pkr).toBeGreaterThan(0);
  });
});

describe("resolveRulesFor", () => {
  const find = (rules: InstallmentRule[], tenure: number): InstallmentRule =>
    rules.find((rule) => rule.tenure_months === tenure)!;

  it("falls back to the built-in schedule when nothing is authored", async () => {
    const { service } = fixture();
    const resolved = await service.resolveRulesFor(PRODUCT, VARIANT);
    expect(find(resolved, 3)).toEqual(DEFAULT_INSTALLMENT_RULES[0]);
  });

  it("lets a variant override one tenure without disturbing the rest", async () => {
    const { service } = fixture([
      { scope: "variant", scope_id: VARIANT, tenure_months: 9, advance_bps: 1_000 },
    ]);
    const resolved = await service.resolveRulesFor(PRODUCT, VARIANT);

    expect(find(resolved, 9).advance_bps).toBe(1_000);
    expect(find(resolved, 3)).toEqual(DEFAULT_INSTALLMENT_RULES[0]);
    expect(find(resolved, 12)).toEqual(DEFAULT_INSTALLMENT_RULES[3]);
  });
});
