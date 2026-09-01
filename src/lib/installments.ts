import {
  installmentDisclosure,
  type InstallmentDisclosure,
  type InstallmentState,
} from "@/lib/pk";
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

/**
 * The authoritative plans for a variant.
 *
 * Uncached. A card's "from Rs X/month" may lag by a minute because it comes from the search
 * index (ADR-014); this is the figure someone is about to agree to, so it is read fresh.
 */
export async function listPlans(variantId: string): Promise<PlanView[]> {
  try {
    const data = await medusaFetch<{ data: { plans: PlanView[] } }>(
      `/store/installment-plans?variant_id=${encodeURIComponent(variantId)}`,
      { cache: "no-store" },
    );
    return (data.data.plans ?? []).filter(isArithmeticallySound);
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
