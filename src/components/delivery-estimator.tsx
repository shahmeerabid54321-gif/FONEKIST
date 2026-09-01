import { PK_PROVINCES } from "@/lib/pk";

/**
 * Delivery estimator. Source of truth: 05_UX_DESIGN_SPEC.md section 5 and CUST-010.
 *
 * Output is always an ETA *range* with the fee — never an exact promised date, which the
 * spec forbids without operational evidence. On the PDP there is no cart yet, so this
 * states the published rates for a destination rather than quoting a specific order.
 */
export function DeliveryEstimator({
  province,
  estimate,
}: {
  province?: string;
  estimate?: { label: string; price: number; etaMin: number; etaMax: number; codAvailable: boolean } | null;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--line)] p-4">
      <form action="" method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor="delivery-province"
            className="block text-sm font-medium"
          >
            Delivery estimate
          </label>
          <select
            id="delivery-province"
            name="province"
            defaultValue={province ?? ""}
            className="mt-1.5 min-h-[44px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3"
          >
            <option value="">Select your province</option>
            {PK_PROVINCES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-[44px] rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-5 transition-colors  hover:bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)]"
        >
          Check
        </button>
      </form>

      {estimate && (
        <div className="mt-3 border-t border-[var(--line)] pt-3 text-sm">
          <p>
            <span className="font-medium">{estimate.label}</span>
            {" · "}
            <span className="font-mono">
              {estimate.price === 0 ? "Free" : `Rs ${estimate.price.toLocaleString("en-PK")}`}
            </span>
          </p>
          <p className="mt-1 text-[var(--text-muted)]">
            Arrives in {estimate.etaMin} to {estimate.etaMax} working days after dispatch.
          </p>
          <p className="mt-1 text-[var(--text-muted)]">
            {estimate.codAvailable
              ? "Cash on delivery available for this destination."
              : "Cash on delivery is not available for this destination."}
          </p>
        </div>
      )}

      {!estimate && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Choose a province to see the delivery fee and estimated time.
        </p>
      )}
    </div>
  );
}
