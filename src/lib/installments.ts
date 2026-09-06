import {
  installmentDisclosure,
  type InstallmentDisclosure,
  type InstallmentState,
} from "@/lib/pk";
import { cacheLife, cacheTag } from "next/cache";
import { capture, unwrap, type Degradable } from "./cached-read";
import { medusaFetch } from "./medusa";

/**
 * Installment plans, read from commerce.
 *
 * Nothing here computes an amount. `installmentDisclosure` exists in the shared contracts
 * and commerce returns its output already computed, so a page cannot display arithmetic the
 * backend would not stand behind. The one thing this module adds is the shape the UI needs
 * and a hard refusal to render a plan whose stated total does not match its own parts.
 */

export interface PlanView extends InstallmentDisclosure {
  id: string;
  label: string;
  variant_id: string;
}

async function fetchPlans(variantId: string): Promise<Degradable<PlanView[]>> {
  "use cache";
  cacheLife("hours");
  cacheTag(`plans:${variantId}`);

  return capture(async () => {
    const data = await medusaFetch<{ data: { plans: PlanView[] } }>(
      `/store/installment-plans?variant_id=${encodeURIComponent(variantId)}`,
    );
    // Only a genuinely empty, arithmetically sound plan list is cached as one. A failure is
    // stored as a failure, so an outage can never become "this handset has no plans".
    return (data.data.plans ?? []).filter(isArithmeticallySound);
  });
}

/**
 * The authoritative plans for a variant.
 *
 * Cached for an hour, which is a change from the `no-store` this used to be. A schedule is
 * derived from the advance and markup shares authored in `installment_rule` (ADR-028), and
 * those are edited by a merchant rather than moved by a market: an hour-old schedule is the
 * same schedule. What made the old reasoning right was that this is "the figure someone is
 * about to agree to" — and that is still handled, one step later and more strictly, because
 * `submitApplicationAction` re-reads plans and price uncached at the moment of submission.
 * Displaying a plan and agreeing to one are different acts with different freshness needs.
 *
 * `isArithmeticallySound` still runs on every plan before it is cached, so an inconsistent
 * row is never stored, let alone shown.
 *
 * The fallback is outside the cache deliberately: caching an empty plan list after one
 * transient failure would tell every visitor for an hour that this handset has no
 * installment options, which is the single most damaging thing this site could get wrong.
 */
export async function listPlans(variantId: string): Promise<PlanView[]> {
  try {
    return unwrap(await fetchPlans(variantId));
  } catch {
    // Plans are an additional way to buy, not the only one. If this endpoint is down the
    // PDP still sells the handset for cash rather than erroring the page (REL-001).
    return [];
  }
}

/**
 * Refuses a plan whose stated total does not equal its own parts.
 *
 * A plan is only ever shown if `advance + monthly x tenure` is exactly the total printed
 * beside it. If commerce ever returns an inconsistent row, the customer must not be the
 * person who discovers it by paying a different amount than the page promised.
 */
export function isArithmeticallySound(plan: PlanView): boolean {
  return (
    Number.isInteger(plan.advance_pkr) &&
    Number.isInteger(plan.monthly_pkr) &&
    plan.monthly_pkr > 0 &&
    plan.tenure_months > 0 &&
    plan.total_payable_pkr === plan.advance_pkr + plan.monthly_pkr * plan.tenure_months &&
    plan.monthly_total_pkr === plan.monthly_pkr * plan.tenure_months &&
    plan.total_payable_pkr >= plan.cash_price_pkr
  );
}

/** The cheapest monthly figure, for a "from Rs X/month" line. Null when there are none. */
export function cheapestMonthly(plans: PlanView[]): PlanView | null {
  if (plans.length === 0) return null;
  return [...plans].sort((a, b) => a.monthly_pkr - b.monthly_pkr)[0]!;
}

/** Rebuilds the disclosure locally, used where only the raw figures are to hand. */
export function disclose(plan: {
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  cash_price_pkr: number;
}): InstallmentDisclosure {
  return installmentDisclosure(plan);
}

/* --------------------------------------------------------------- Applications */

export interface ApplicationStatus {
  reference: string;
  state: InstallmentState;
  state_label: string;
  plan: PlanView;
  reserved_until: string | null;
  decided_at: string | null;
  created_at: string;
}

export async function getApplicationStatus(
  reference: string,
  phone: string,
): Promise<ApplicationStatus | null> {
  try {
    const data = await medusaFetch<{ data: ApplicationStatus }>(
      `/store/installment-applications/${encodeURIComponent(reference)}?phone=${encodeURIComponent(phone)}`,
      { cache: "no-store" },
    );
    return data.data;
  } catch {
    // An unknown reference and a wrong phone give the same answer, so this cannot be used
    // to discover which references exist.
    return null;
  }
}
