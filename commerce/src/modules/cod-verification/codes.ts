import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Confirmation code generation and checking.
 *
 * Separated from the service so the security-relevant parts are testable without a
 * database, and so there is exactly one place that decides what a valid code is.
 */

/** Six digits: long enough that guessing is hopeless within the attempt limit, short enough to read out. */
const CODE_LENGTH = 6;

/**
 * Generates a code using a CSPRNG.
 *
 * `Math.random()` would be catastrophic here and is the standard way this gets built wrong:
 * its output is predictable from previous values, so an attacker who has seen a few codes
 * can compute the next one.
 */
export function generateCode(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) code += String(randomInt(0, 10));
  return code;
}

/**
 * Hashes a code for storage.
 *
 * Keyed with a server secret so that a leaked database alone does not let anyone verify a
 * challenge: a six-digit code has a million possibilities and an unkeyed hash of it is a
 * lookup table away from plaintext.
 */
export function hashCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

/** Constant-time comparison, so response timing cannot be used to recover a code digit by digit. */
export function codeMatches(candidate: string, storedHash: string, secret: string): boolean {
  const candidateHash = Buffer.from(hashCode(candidate, secret), "hex");
  const expected = Buffer.from(storedHash, "hex");

  // `timingSafeEqual` throws on a length mismatch, which would itself leak; check first.
  if (candidateHash.length !== expected.length) return false;
  return timingSafeEqual(candidateHash, expected);
}

/** `+923001234567` → `+92 *** *** 4567`. Enough to recognise, not enough to reconstruct. */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length < 6) return "***";
  return `${trimmed.slice(0, 3)} *** *** ${trimmed.slice(-4)}`;
}
