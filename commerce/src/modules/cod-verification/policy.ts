/**
 * When a COD order must be verified before dispatch.
 *
 * A merchant setting, not a constant: the right threshold depends on the assortment and on
 * the refusal rate the merchant is actually seeing (TRD section 14). It is expressed as a
 * value threshold because that is what the risk scales with — the cost of a refused
 * delivery is the goods plus two courier legs.
 *
 * Verifying *every* COD order would add friction to the cheapest, lowest-risk orders,
 * which is how a control meant to reduce refusals ends up reducing conversion instead.
 */
export function codVerificationRequired(orderTotalPkr: number): boolean {
  const threshold = Number(process.env.COD_VERIFICATION_THRESHOLD_PKR ?? 25000);
  if (!Number.isFinite(threshold) || threshold <= 0) return true;
  return orderTotalPkr >= threshold;
}

export function codVerificationThreshold(): number {
  return Number(process.env.COD_VERIFICATION_THRESHOLD_PKR ?? 25000);
}
