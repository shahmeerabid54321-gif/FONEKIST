import { randomBytes } from "node:crypto";
import { MedusaError, MedusaService } from "@medusajs/framework/utils";
import {
  MINIMUM_PLAN_PRICE_PKR,
  canTransitionInstallment,
  deriveInstallmentPlans,
  holdsReservation,
  installmentDisclosure,
  isPlanOfferable,
  maskCnic,
  resolveInstallmentRules,
  type InstallmentRule,
  type InstallmentRuleScope,
  type InstallmentState,
} from "@pk/contracts";
import {
  InstallmentApplication,
  InstallmentAuditEvent,
  InstallmentDocument,
  InstallmentPlan,
  InstallmentRule as InstallmentRuleModel,
} from "./models";

/**
 * Installment plans, applications, documents and their audit trail.
 *
 * The module owns the credit domain and nothing else. It does not create orders, reserve
 * stock or send notifications: those belong to Medusa's own modules and to the API layer
 * that composes them (ADR-005). What lives here is the part Medusa has no model for — a
 * curated offer, an application against it, and the record of who decided what.
 */

export interface PlanRow {
  id: string;
  product_id: string;
  variant_id: string;
  label: string;
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  total_payable_pkr: number;
  cash_price_pkr: number;
  active: boolean;
  active_from: Date | null;
  active_until: Date | null;
  sort_order: number;
}

export interface RuleRow extends InstallmentRule {
  id: string;
  scope: InstallmentRuleScope;
  scope_id: string | null;
  updated_by: string | null;
  sort_order: number;
}

export interface ApplicationRow {
  id: string;
  reference: string;
  state: InstallmentState;
  cart_id: string | null;
  order_id: string | null;
  plan_id: string;
  product_id: string;
  variant_id: string;
  plan_label: string;
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  total_payable_pkr: number;
  cash_price_pkr: number;
  difference_pkr: number;
  applicant_name: string;
  applicant_cnic: string | null;
  applicant_phone: string;
  applicant_email: string;
  guarantor_name: string;
  guarantor_cnic: string | null;
  guarantor_phone: string;
  guarantor_relationship: string;
  monthly_income_pkr: number;
  employment_type: string;
  employer_name: string | null;
  delivery_address: Record<string, unknown> | null;
  reservation_id: string | null;
  reserved_until: Date | null;
  decided_at: Date | null;
  decided_by: string | null;
  decision_note: string | null;
  purge_after: Date | null;
  purged_at: Date | null;
  created_at: Date;
}

class InstallmentsService extends MedusaService({
  InstallmentPlan,
  InstallmentApplication,
  InstallmentDocument,
  InstallmentAuditEvent,
  InstallmentRule: InstallmentRuleModel,
}) {
  /* ------------------------------------------------------------------------ Plans */

  /**
   * The plans a customer may actually be offered for a variant, cheapest monthly first.
   *
   * Filtering happens here rather than in the caller so a plan outside its active window
   * cannot be offered by a route that forgot to check. `isPlanOfferable` is the single
   * definition of "offerable" and both this and the search projection use it.
   */
  async listOfferablePlans(variantId: string, now: Date = new Date()): Promise<PlanRow[]> {
    const plans = (await this.listInstallmentPlans({ variant_id: variantId })) as unknown as PlanRow[];
    return plans
      .filter((plan) => isPlanOfferable(plan, now))
      .sort((a, b) => a.sort_order - b.sort_order || a.monthly_pkr - b.monthly_pkr);
  }

  /**
   * The cheapest offerable monthly figure per product, for the search projection.
   *
   * Batched deliberately: this is called once per reindex over the whole catalogue, and a
   * per-product query here is the N+1 the denormalisation exists to remove.
   */
  async minimumsByProduct(
    productIds: string[],
    now: Date = new Date(),
  ): Promise<Record<string, { min_monthly_pkr: number; min_advance_pkr: number }>> {
    if (productIds.length === 0) return {};

    const plans = (await this.listInstallmentPlans(
      { product_id: productIds },
      { take: null },
    )) as unknown as PlanRow[];

    const result: Record<string, { min_monthly_pkr: number; min_advance_pkr: number }> = {};
    for (const plan of plans) {
      if (!isPlanOfferable(plan, now)) continue;
      // A zero here would become "from Rs 0 a month" on a card while the PDP, which filters
      // on the same arithmetic, showed nothing at all. Two surfaces disagreeing about a
      // price is worse than one of them being absent.
      if (plan.monthly_pkr <= 0) continue;
      const current = result[plan.product_id];
      if (!current || plan.monthly_pkr < current.min_monthly_pkr) {
        result[plan.product_id] = {
          min_monthly_pkr: plan.monthly_pkr,
          // The advance that goes with the cheapest monthly, not the cheapest advance in
          // the catalogue: quoting two figures from two different plans describes an offer
          // that does not exist.
          min_advance_pkr: plan.advance_pkr,
        };
      }
    }
    return result;
  }

  /**
   * Creates or updates a plan, refusing an inconsistent total.
   *
   * The arithmetic is recomputed rather than trusted. A stored total that disagrees with
   * advance + monthly * tenure is a figure a customer would be shown and then not charged,
   * and the customer must never be the one who discovers it.
   */
  async upsertPlan(input: Omit<PlanRow, "id"> & { id?: string }): Promise<PlanRow> {
    const expected = input.advance_pkr + input.monthly_pkr * input.tenure_months;
    if (input.total_payable_pkr !== expected) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Plan total is Rs ${input.total_payable_pkr} but advance plus monthly times tenure is Rs ${expected}.`,
      );
    }
    if (input.total_payable_pkr < input.cash_price_pkr) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "An installment plan cannot total less than the cash price.",
      );
    }
    if (!Number.isInteger(input.monthly_pkr) || !Number.isInteger(input.advance_pkr)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Amounts must be whole rupees.");
    }
    // `installmentPlanSchema` has always declared this refinement; the write path never
    // enforced it. A Rs 0 monthly is not a free phone, it is a plan with no schedule.
    if (input.monthly_pkr <= 0 || input.advance_pkr <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A plan needs an advance and a monthly amount above zero.",
      );
    }

    if (input.id) {
      const { id, ...rest } = input;
      await this.updateInstallmentPlans({ selector: { id }, data: rest } as never);
      return (await this.retrieveInstallmentPlan(id)) as unknown as PlanRow;
    }

    // `id` is stripped rather than passed through as undefined: a create carrying an
    // explicit undefined primary key is a row whose id depends on how the ORM feels about
    // the difference between absent and undefined.
    const { id: _unset, ...fields } = input;
    const created = await this.createInstallmentPlans(fields as never);
    return (Array.isArray(created) ? created[0] : created) as unknown as PlanRow;
  }

  /* ------------------------------------------------------------------------ Rules */

  /**
   * The schedule in force for one variant, tenure by tenure.
   *
   * One query rather than three: the three scopes are a small, bounded set of rows, and
   * three round trips to resolve a single product page would be three round trips more
   * than the data justifies.
   */
  async resolveRulesFor(productId: string, variantId: string): Promise<InstallmentRule[]> {
    const rows = (await this.listInstallmentRules(
      {
        $or: [
          { scope: "global" },
          { scope: "product", scope_id: productId },
          { scope: "variant", scope_id: variantId },
        ],
      },
      { take: null },
    )) as unknown as RuleRow[];

    const at = (scope: InstallmentRuleScope): RuleRow[] =>
      rows.filter((row) => row.scope === scope);

    return resolveInstallmentRules({
      global: at("global"),
      product: at("product"),
      variant: at("variant"),
    });
  }

  /** The rows authored at one scope, without any inheritance applied. */
  async listRulesAt(scope: InstallmentRuleScope, scopeId: string | null): Promise<RuleRow[]> {
    const rows = (await this.listInstallmentRules(
      { scope, scope_id: scopeId },
      { take: null },
    )) as unknown as RuleRow[];
    return rows.sort((a, b) => a.tenure_months - b.tenure_months);
  }

  /**
   * Replaces the schedule authored at one scope.
   *
   * Replace rather than merge: a schedule is read as a whole, and a partial write would
   * leave a tenure the admin thought they had removed still in force. Tenures absent from
   * the payload are cleared, so the scope falls back to inheriting them.
   */
  async upsertRules(
    scope: InstallmentRuleScope,
    scopeId: string | null,
    rules: readonly InstallmentRule[],
    actor: string,
  ): Promise<RuleRow[]> {
    const existing = await this.listRulesAt(scope, scopeId);
    const byTenure = new Map(existing.map((row) => [row.tenure_months, row]));

    for (const [index, rule] of rules.entries()) {
      const current = byTenure.get(rule.tenure_months);
      const data = {
        scope,
        scope_id: scopeId,
        tenure_months: rule.tenure_months,
        advance_bps: rule.advance_bps,
        markup_bps: rule.markup_bps,
        active: rule.active,
        updated_by: actor,
        sort_order: index,
      };

      if (current) {
        await this.updateInstallmentRules({ selector: { id: current.id }, data } as never);
        byTenure.delete(rule.tenure_months);
      } else {
        await this.createInstallmentRules(data as never);
      }
    }

    // Whatever the payload did not mention is no longer authored here.
    const stale = [...byTenure.values()].map((row) => row.id);
    if (stale.length > 0) await this.deleteInstallmentRules(stale);

    return this.listRulesAt(scope, scopeId);
  }

  /**
   * Removes every rule authored at one scope, so it inherits again.
   *
   * A hard delete, unlike a withdrawn plan: nothing references a rule row, and an
   * "inactive" rule already means something else here — this tenure is not offered — so
   * deactivating would say the opposite of what the admin asked for.
   */
  async clearRules(scope: InstallmentRuleScope, scopeId: string | null): Promise<number> {
    const existing = await this.listRulesAt(scope, scopeId);
    if (existing.length > 0) await this.deleteInstallmentRules(existing.map((row) => row.id));
    return existing.length;
  }

  /**
   * Rewrites one variant's plans from the schedule in force.
   *
   * Reconciled in place, keyed on tenure, for one reason: a plan id is a live reference. It
   * sits in the URL of an application in progress and in `installment_application.plan_id`
   * on every application already submitted. Deleting and recreating would break both.
   *
   * A tenure that is no longer offered is deactivated, never deleted. `isPlanOfferable`
   * hides an inactive plan from the store API, the PDP and the search index, so the offer
   * is gone; but the row is still retrievable, which is what lets the application route
   * answer "That plan is no longer available" instead of faulting, and lets the reservation
   * and purge jobs keep working against applications that reference it.
   */
  async regeneratePlansFor(
    productId: string,
    variantId: string,
    cashPricePkr: number,
  ): Promise<{ created: number; updated: number; deactivated: number }> {
    const existing = (await this.listInstallmentPlans(
      { variant_id: variantId },
      { take: null },
    )) as unknown as PlanRow[];
    const byTenure = new Map(existing.map((plan) => [plan.tenure_months, plan]));

    // Below the floor there is no offer at all, and any plan authored when the price was
    // higher has to come off the page.
    const derived =
      Number.isInteger(cashPricePkr) && cashPricePkr >= MINIMUM_PLAN_PRICE_PKR
        ? deriveInstallmentPlans(cashPricePkr, await this.resolveRulesFor(productId, variantId))
        : [];

    let created = 0;
    let updated = 0;
    let deactivated = 0;

    for (const plan of derived) {
      const current = byTenure.get(plan.tenure_months);
      await this.upsertPlan({
        id: current?.id,
        product_id: productId,
        variant_id: variantId,
        label: plan.label,
        advance_pkr: plan.advance_pkr,
        monthly_pkr: plan.monthly_pkr,
        tenure_months: plan.tenure_months,
        total_payable_pkr: plan.total_payable_pkr,
        cash_price_pkr: plan.cash_price_pkr,
        active: true,
        active_from: current?.active_from ?? null,
        active_until: current?.active_until ?? null,
        sort_order: plan.sort_order,
      });
      if (current) {
        updated += 1;
        byTenure.delete(plan.tenure_months);
      } else {
        created += 1;
      }
    }

    for (const withdrawn of byTenure.values()) {
      if (!withdrawn.active) continue;
      await this.updateInstallmentPlans({
        selector: { id: withdrawn.id },
        data: { active: false },
      } as never);
      deactivated += 1;
    }

    return { created, updated, deactivated };
  }

  /* ----------------------------------------------------------------- Applications */

  /**
   * A public reference that cannot be enumerated.
   *
   * Sequential ids leak volume and let anyone walk the list by incrementing a number
   * (API contract section 4). Random and short enough to read down a phone line.
   */
  newReference(): string {
    return `FK-${randomBytes(4).toString("hex").toUpperCase()}`;
  }

  async findByReference(reference: string): Promise<ApplicationRow | null> {
    const rows = (await this.listInstallmentApplications({
      reference,
    })) as unknown as ApplicationRow[];
    return rows[0] ?? null;
  }

  /**
   * Moves an application to a new state, refusing an illegal transition.
   *
   * Every transition writes an audit row in the same call. Making the two separable is how
   * an untraced state change eventually happens.
   */
  async transition(
    applicationId: string,
    to: InstallmentState,
    context: { actor: string; note?: string; detail?: Record<string, unknown> },
  ): Promise<ApplicationRow> {
    const application = (await this.retrieveInstallmentApplication(
      applicationId,
    )) as unknown as ApplicationRow;

    if (application.state === to) return application;

    if (!canTransitionInstallment(application.state, to)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `An application that is ${application.state} cannot become ${to}.`,
      );
    }

    await this.updateInstallmentApplications({
      selector: { id: applicationId },
      data: { state: to },
    } as never);

    await this.recordAudit({
      application_id: applicationId,
      action: `state.${to}`,
      actor: context.actor,
      from_state: application.state,
      to_state: to,
      note: context.note ?? null,
      detail: context.detail ?? null,
    });

    return { ...application, state: to };
  }

  /**
   * Appends an audit row.
   *
   * The CNIC guard is here rather than at each call site because a call site is exactly
   * where it gets forgotten. A note or detail carrying thirteen consecutive digits is
   * refused outright: this table is read by people who are not the reviewer.
   */
  async recordAudit(input: {
    application_id: string;
    action: string;
    actor: string;
    from_state?: string | null;
    to_state?: string | null;
    note?: string | null;
    detail?: Record<string, unknown> | null;
  }): Promise<void> {
    const serialised = `${input.note ?? ""} ${JSON.stringify(input.detail ?? {})}`;
    if (/\d{13}/.test(serialised.replace(/[\s-]/g, ""))) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "An audit entry may not contain a CNIC (ADR-024).",
      );
    }
    await this.createInstallmentAuditEvents(input as never);
  }

  /**
   * Records that a reviewer read a full CNIC or opened a document.
   *
   * ADR-024 requires every such read to be audited. It is a separate method so the call is
   * visible at the point the data is disclosed rather than buried in a generic update.
   */
  async recordDisclosure(
    applicationId: string,
    actor: string,
    what: "cnic" | "document",
    documentId?: string,
  ): Promise<void> {
    await this.recordAudit({
      application_id: applicationId,
      action: `disclosure.${what}`,
      actor,
      detail: documentId ? { document_id: documentId } : null,
    });
  }

  /** Applications whose reservation has lapsed and that nobody has decided (INST-009). */
  async listExpiredReservations(now: Date = new Date()): Promise<ApplicationRow[]> {
    const rows = (await this.listInstallmentApplications(
      {},
      { take: null },
    )) as unknown as ApplicationRow[];
    return rows.filter(
      (row) => holdsReservation(row.state) && row.reserved_until != null && row.reserved_until <= now,
    );
  }

  /** Applications whose identity data is due for deletion (SEC-007). */
  async listDueForPurge(now: Date = new Date()): Promise<ApplicationRow[]> {
    const rows = (await this.listInstallmentApplications(
      {},
      { take: null },
    )) as unknown as ApplicationRow[];
    return rows.filter(
      (row) => row.purged_at == null && row.purge_after != null && row.purge_after <= now,
    );
  }

  /**
   * The safe projection of an application: masked CNIC, no document bytes.
   *
   * Every list view and every notification goes through this. The unmasked row is reachable
   * only by explicitly retrieving it and calling `recordDisclosure`, which is what makes
   * the access rule a control rather than a convention.
   */
  toSafeView(row: ApplicationRow) {
    const disclosure = installmentDisclosure({
      advance_pkr: row.advance_pkr,
      monthly_pkr: row.monthly_pkr,
      tenure_months: row.tenure_months,
      cash_price_pkr: row.cash_price_pkr,
    });

    return {
      id: row.id,
      reference: row.reference,
      state: row.state,
      order_id: row.order_id,
      product_id: row.product_id,
      variant_id: row.variant_id,
      plan: {
        label: row.plan_label,
        ...disclosure,
      },
      applicant: {
        name: row.applicant_name,
        cnic_masked: row.applicant_cnic ? maskCnic(row.applicant_cnic) : null,
        phone: row.applicant_phone,
        email: row.applicant_email,
        employment_type: row.employment_type,
        monthly_income_pkr: row.monthly_income_pkr,
      },
      guarantor: {
        name: row.guarantor_name,
        cnic_masked: row.guarantor_cnic ? maskCnic(row.guarantor_cnic) : null,
        phone: row.guarantor_phone,
        relationship: row.guarantor_relationship,
      },
      reserved_until: row.reserved_until,
      decided_at: row.decided_at,
      decision_note: row.decision_note,
      created_at: row.created_at,
    };
  }
}

export default InstallmentsService;
