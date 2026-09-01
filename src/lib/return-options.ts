/**
 * The choices a customer picks from when asking to return an order.
 *
 * Deliberately its own module with no imports.
 *
 * These are rendered by `return-request-form.tsx`, which is a client component, and they
 * used to be exported from `lib/orders.ts`. That module imports `lib/medusa`, which imports
 * `serverEnv`, so importing two constant arrays pulled the server environment into the
 * client bundle and `serverEnv`'s guard threw during hydration on every page of the site.
 * A value import is a whole module graph; only `import type` is free.
 */

export const RETURN_REASONS = [
  { value: "damaged_in_transit", label: "Arrived damaged" },
  { value: "wrong_item", label: "Wrong item sent" },
  { value: "not_as_described", label: "Not as described" },
  { value: "faulty", label: "Faulty or not working" },
  { value: "missing_parts", label: "Missing parts or accessories" },
  { value: "changed_mind", label: "Changed my mind" },
] as const;

export const RETURN_RESOLUTIONS = [
  { value: "refund", label: "Refund" },
  { value: "replacement", label: "Replacement" },
  { value: "repair", label: "Repair" },
] as const;
