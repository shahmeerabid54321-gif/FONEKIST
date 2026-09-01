/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/states/cod.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

/**
 * Cash-on-delivery operational states. Source of truth: 07_SYSTEM_ARCHITECTURE.md section 10.
 * The minimum requirement is distinguishing unverified risky COD from ready-to-fulfil.
 */
export const COD_STATES = [
  "cod_pending_confirmation",
  "cod_confirmed",
  "cod_rejected",
  "cod_shipped",
  "cod_collected",
  "cod_returned",
] as const;

export type CodState = (typeof COD_STATES)[number];

export const COD_TRANSITIONS: Record<CodState, readonly CodState[]> = {
  cod_pending_confirmation: ["cod_confirmed", "cod_rejected"],
  cod_confirmed: ["cod_shipped", "cod_rejected"],
  cod_rejected: [],
  cod_shipped: ["cod_collected", "cod_returned"],
  cod_collected: [],
  cod_returned: [],
};

/** Only a confirmed COD order may be fulfilled (PAY-005). */
export function isFulfillableCod(state: CodState): boolean {
  return state === "cod_confirmed" || state === "cod_shipped";
}

export function canTransitionCod(from: CodState, to: CodState): boolean {
  return COD_TRANSITIONS[from].includes(to);
}

/** COD verification method (08_DATA_MODEL.md section 12). */
export const COD_VERIFICATION_METHODS = ["otp", "call", "none"] as const;
export type CodVerificationMethod = (typeof COD_VERIFICATION_METHODS)[number];

export const COD_VERIFICATION_STATUSES = [
  "not_required",
  "pending",
  "verified",
  "failed",
  "expired",
] as const;
export type CodVerificationStatus = (typeof COD_VERIFICATION_STATUSES)[number];
