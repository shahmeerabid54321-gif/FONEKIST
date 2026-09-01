import { z } from "zod";

/**
 * Pakistan address and phone baseline. Source of truth: 05_UX_DESIGN_SPEC.md section 8.
 * Deliberately no required postal code: operations do not need a US-style ZIP.
 */

export const PK_PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
  "Islamabad Capital Territory",
] as const;

export type PkProvince = (typeof PK_PROVINCES)[number];

/**
 * Accepts the formats Pakistani customers actually type: 03XXXXXXXXX, +923XXXXXXXXX,
 * 00923XXXXXXXXX, with optional spaces or dashes. Normalised to E.164 for storage.
 */
const PHONE_CLEAN = /[\s-()]/g;

export const pkMobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(PHONE_CLEAN, ""))
  .refine(
    (value) => /^(?:\+92|0092|92|0)?3\d{9}$/.test(value),
    "Enter a valid Pakistani mobile number, for example 0300 1234567.",
  )
  .transform((value) => {
    const digits = value.replace(/^\+/, "").replace(/^0092/, "").replace(/^92/, "").replace(/^0/, "");
    return `+92${digits}`;
  });

export function formatPkMobile(e164: string): string {
  const digits = e164.replace(/^\+92/, "");
  if (digits.length !== 10) return e164;
  return `0${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export const addressSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name for delivery."),
  phone: pkMobileSchema,
  province: z.enum(PK_PROVINCES, { errorMap: () => ({ message: "Select a province." }) }),
  city: z.string().trim().min(2, "Enter the city."),
  area: z.string().trim().min(2, "Enter the area or locality."),
  street: z.string().trim().min(4, "Enter the street address."),
  landmark: z.string().trim().max(120).optional(),
  instructions: z.string().trim().max(400).optional(),
});

export type Address = z.infer<typeof addressSchema>;

export const contactSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  phone: pkMobileSchema,
});

/** PKR is presented without decimals; amounts are integer rupees throughout. */
export const pkrAmountSchema = z.number().int().nonnegative();

export function formatPkr(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK")}`;
}

/**
 * CNIC (Computerised National Identity Card) number.
 *
 * Thirteen digits, conventionally written 12345-1234567-1. Stored normalised to bare
 * digits so a customer who types the dashes and one who does not produce the same value.
 *
 * The check digit is not verified: NADRA's algorithm is not public, so any client-side
 * "validation" beyond the shape would reject real cards. Shape only, and the document
 * itself is what a reviewer actually checks (ADR-024).
 */
export const cnicSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .refine((value) => /^\d{13}$/.test(value), "Enter the 13-digit CNIC number from the card.");

/** Formats a stored CNIC for display: 12345-1234567-1. */
export function formatCnic(digits: string): string {
  if (!/^\d{13}$/.test(digits)) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * Masks a CNIC for any list view, log line or notification (ADR-024, SEC-006).
 *
 * The last four digits are kept because a reviewer needs to tell two applications apart;
 * everything that would identify the holder is not. This is the ONLY form of a CNIC that
 * may appear outside the reviewer detail view.
 */
export function maskCnic(digits: string): string {
  if (!/^\d{13}$/.test(digits)) return "*************";
  return `*****-****${digits.slice(9, 12)}-${digits.slice(12)}`;
}
