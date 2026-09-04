import { formatPkr } from "@/lib/pk";
import type { PlanView } from "@/lib/installments";
import { publicEnv } from "@/lib/env";

/**
 * The WhatsApp handoff.
 *
 * Applications are reviewed by a person, and in this market that person is reached on
 * WhatsApp rather than by email. This builds a click-to-chat link the customer presses
 * themselves: their own WhatsApp opens with the message already written and they send it.
 * Nothing is sent on their behalf and no number leaves the browser.
 *
 * Two rules bind what the message may say:
 *
 *  - **No CNIC, ever** (ADR-024). A CNIC lives in one table. It is not in the message, it is
 *    not in the reference, and `applicationMessage` is given the plan and the reference and
 *    nothing else so there is no identity data in scope to leak by accident.
 *  - **The monthly figure never travels without its total** (INST-003). A message quoting
 *    "Rs 8,500 a month" and stopping there is the exact thing this storefront exists not to
 *    do, so the cash price, the advance, the arithmetic, the total and the difference all go
 *    with it.
 */

/**
 * The shop's number in the form `wa.me` wants: digits only, country code included.
 *
 * Returns null when nothing usable is configured, and every caller renders nothing in that
 * case. A "Send on WhatsApp" button that opens a chat with no one is worse than no button.
 */
export function whatsappNumber(raw: string = publicEnv.NEXT_PUBLIC_WHATSAPP_NUMBER): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d{10,})/, "");
  // Shortest plausible international number. Below this it is a typo or a local-format
  // number missing its country code, and either way the link would not reach us.
  return digits.length >= 10 ? digits : null;
}

/**
 * What the customer sends us.
 *
 * Written in the first person because the customer is the sender: it arrives in our inbox
 * as a message from them, not as a system alert dressed up as one.
 */
export function applicationMessage(reference: string, plan: PlanView): string {
  return [
    "FONEKIST installment application",
    "",
    `Reference: ${reference}`,
    `Plan: ${plan.label}`,
    `Cash price: ${formatPkr(plan.cash_price_pkr)}`,
    `Advance: ${formatPkr(plan.advance_pkr)}`,
    `Monthly: ${formatPkr(plan.monthly_pkr)} x ${plan.tenure_months} = ${formatPkr(plan.monthly_total_pkr)}`,
    `Total payable: ${formatPkr(plan.total_payable_pkr)}`,
    `That is ${formatPkr(plan.difference_pkr)} more than the cash price (${plan.difference_percent}%).`,
    "",
    "I have just submitted this application on the website.",
  ].join("\n");
}

/** The full click-to-chat URL, or null when no number is configured. */
export function applicationChatUrl(reference: string, plan: PlanView): string | null {
  const number = whatsappNumber();
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(applicationMessage(reference, plan))}`;
}
