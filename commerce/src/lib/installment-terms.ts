/**
 * The installment offer's terms, in one place.
 *
 * Two rules make this file worth existing rather than scattering the strings:
 *
 * 1. **The offer is a deferred-payment sale of goods, not a loan** (ADR-025). There is a
 *    cash price and an installment price, and the difference is disclosed in rupees. No
 *    wording here describes a rate, interest, financing or a loan, and none should be
 *    added: that language describes a regulated lending product, which this is not.
 *
 * 2. **The exact text shown is stored with the application** (SEC-008). A stored boolean
 *    cannot answer "agreed to what". Changing the wording means changing
 *    `INSTALLMENT_TERMS_VERSION`, so an old application still reports the wording its
 *    customer actually saw.
 *
 * Every figure a customer is shown is computed by `installmentDisclosure`; nothing in this
 * file states an amount.
 */

export function termsVersion(): string {
  return process.env.INSTALLMENT_TERMS_VERSION ?? "unversioned";
}

export function reservationTtlHours(): number {
  const raw = Number(process.env.INSTALLMENT_RESERVATION_TTL_HOURS ?? 48);
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
}

export function retentionDays(): number {
  const raw = Number(process.env.INSTALLMENT_DOCUMENT_RETENTION_DAYS ?? 90);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

/**
 * The consent text, keyed by version.
 *
 * Old versions stay here forever. Deleting one would leave every application that agreed
 * to it unable to say what it agreed to, which defeats the point of versioning it.
 */
const TERMS: Record<string, string> = {
  "2026-08-27": [
    "This is a purchase in installments, not a loan.",
    "",
    "You are buying the handset at an installment price, which is higher than the cash price. The cash price, the advance, the monthly amount, the number of months, the total you will pay and the exact difference from the cash price in rupees are all shown to you before you apply, and they do not change afterwards.",
    "",
    "By applying you confirm that:",
    "- the details and documents you have given are your own and are correct;",
    "- you are 18 or older;",
    "- your guarantor has agreed to be named and has given you their details for this purpose;",
    "- we may contact you and your guarantor about this application;",
    "- we may check the information you have given in order to decide.",
    "",
    "What happens next:",
    "- We hold the handset for you while we review this. Nothing is charged now.",
    "- A person reads your application. We will tell you the outcome either way.",
    "- If we approve it, we will call you to arrange the advance and sign the agreement. We will never ask for card or bank details over the phone.",
    "- If we do not approve it, or if we cannot finish reviewing it in time, the handset is released and nothing is charged.",
    "",
    "Your documents:",
    "- Your CNIC and your guarantor's CNIC are used only to decide this application and, if it is approved, to service it.",
    "- Only the staff reviewing applications can see them, and every time one is opened it is recorded.",
    "- They are deleted 90 days after we decline or cancel an application, or 90 days after an approved agreement has been settled. We keep the record of the decision itself.",
    "",
    "You can cancel this application at any time before we approve it by contacting us.",
  ].join("\n"),
};

export function consentText(version: string): string {
  return TERMS[version] ?? TERMS[termsVersion()] ?? "";
}

/** The version and text a storefront should present right now. */
export function currentTerms(): { version: string; text: string } {
  const version = termsVersion();
  return { version, text: consentText(version) };
}
