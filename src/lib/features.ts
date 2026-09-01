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
 */
const isEnabled = (value: string): boolean => value.trim().toLowerCase() === "true";

export const features = {
  comparison: isEnabled(publicEnv.NEXT_PUBLIC_FEATURE_COMPARISON),
  installments: isEnabled(publicEnv.NEXT_PUBLIC_FEATURE_INSTALLMENTS),
} as const;

export type FeatureName = keyof typeof features;
