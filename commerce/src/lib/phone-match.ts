import { timingSafeEqual } from "node:crypto";
import { pkMobileSchema } from "@pk/contracts";

/**
 * Constant-time comparison of two Pakistani mobile numbers.
 *
 * Both sides are normalised to E.164 first, so a customer who typed `0300…` still matches
 * a stored `+92300…`. The comparison is constant-time because this is the second factor
 * guarding guest order access: a variable-time compare leaks the number one byte at a time
 * to anyone patient enough to measure (SEC-004).
 *
 * Shared by order lookup and return requests. Two copies of a security check are one copy
 * that eventually stops being maintained.
 */
export function phonesMatch(stored: string | null | undefined, provided: string | null | undefined): boolean {
  const normalisedStored = pkMobileSchema.safeParse(stored ?? "");
  const normalisedProvided = pkMobileSchema.safeParse(provided ?? "");

  if (!normalisedStored.success || !normalisedProvided.success) return false;

  const a = Buffer.from(normalisedStored.data);
  const b = Buffer.from(normalisedProvided.data);

  // `timingSafeEqual` throws on a length mismatch, which would itself be a signal.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Normalises to E.164, or null when the input is not a usable Pakistani mobile number. */
export function normalizePkMobile(input: string): string | null {
  const parsed = pkMobileSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
