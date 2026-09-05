import { publicEnv } from "./env";

/**
 * Feature gates.
 *
 * Deliberately environment variables rather than a flag service: there are two flags, they
 * change at release boundaries rather than per request, and a service would add a network
 * dependency to page render for no decision it can make better.
 *
 * Only an explicit "true" enables a feature. Anything else, including the empty string, an
 * unset variable, "1" or "yes", reads as off. A flag that gates an unreviewed credit
 * application should not turn itself on because someone typed a truthy-looking value.
 *
 * **`installments` gates intake, not the shop.** It used to gate the whole installments
 * surface, which made sense while there was a cash rail to fall back to. There is not any
 * more: this storefront sells on installments only, so a flag that hid the plans would hide
 * the entire proposition and leave a catalogue nobody could buy from.
 *
 * What it withholds now is the part the ADR-025 legal review is actually about: the pages
 * that collect a CNIC and a guarantor's CNIC. With it off, `/installments/apply` and
 * `/installments/status` are not found, and the plan panel hands the customer to WhatsApp
 * with their chosen plan instead. Everything else, the plans, the disclosure, the query,
 * stays exactly as it is.
 */
const isEnabled = (value: string): boolean => value.trim().toLowerCase() === "true";

export const features = {
  comparison: isEnabled(publicEnv.NEXT_PUBLIC_FEATURE_COMPARISON),
  installments: isEnabled(publicEnv.NEXT_PUBLIC_FEATURE_INSTALLMENTS),
} as const;

export type FeatureName = keyof typeof features;
