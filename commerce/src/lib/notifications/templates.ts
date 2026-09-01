import { formatPkr } from "@pk/contracts";

/**
 * Customer notification templates.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 12 lists the events worth a message. Everything not on
 * that list is not sent: an order lifecycle is not a marketing channel, and a customer who
 * gets a message for every internal state change stops reading the one that matters.
 *
 * Rendering lives here rather than in a provider so the wording is reviewable in one file
 * and identical whichever channel or provider delivers it.
 */

export const NOTIFICATION_TEMPLATES = [
  "order.received",
  "order.cod_confirmation_required",
  "order.cod_confirmed",
  "payment.confirmed",
  "order.shipped",
  "order.delivered",
  "order.cancelled",
  "refund.completed",
  "return.status_changed",
  "cod.verification_code",
  /*
   * Installments. Every state change the customer can see gets a message, including the
   * unhappy ones: an application that is rejected or expires in silence is how somebody
   * ends up waiting weeks for a phone nobody is sending (INST-010).
   */
  "installment.received",
  "installment.information_required",
  "installment.approved",
  "installment.rejected",
  "installment.expired",
] as const;

export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export interface RenderedMessage {
  subject: string;
  body: string;
}

export interface TemplateData {
  order_reference?: string | number;
  total?: number;
  is_cod?: boolean;
  tracking_number?: string | null;
  tracking_url?: string | null;
  eta?: string | null;
  reason?: string | null;
  amount?: number;
  code?: string;
  expires_in_minutes?: number;
  status?: string;
  support_phone?: string | null;
  /** Installment application reference, e.g. FK-1A2B3C4D. Never a CNIC (ADR-024). */
  application_reference?: string;
  advance?: number;
  monthly?: number;
  tenure_months?: number;
  missing?: string | null;
}

const SUPPORT_LINE = (data: TemplateData): string =>
  data.support_phone ? `\n\nQuestions? Call us on ${data.support_phone}.` : "";

/**
 * Renders one message.
 *
 * Every template states a fact and, where there is one, the next step. None of them
 * manufacture urgency, and none of them ask for a payment detail — a message that asks a
 * customer to "confirm card details" is the shape every phishing attempt takes, so ours
 * never does (SEC-001, PRD section 8).
 */
export function renderNotification(
  template: NotificationTemplate,
  data: TemplateData,
): RenderedMessage {
  const reference = `#${data.order_reference ?? ""}`;
  const total = data.total != null ? formatPkr(data.total) : "";

  switch (template) {
    case "order.received":
      return {
        subject: `We have your order ${reference}`,
        body:
          `Thank you. We have received order ${reference} for ${total}.\n\n` +
          (data.is_cod
            ? `You will pay ${total} in cash to the courier on delivery. We may call to confirm the order before dispatch.`
            : `We will confirm your payment shortly and start preparing your order.`) +
          `\n\nYou can track this order with its reference and the phone number you used.` +
          SUPPORT_LINE(data),
      };

    case "order.cod_confirmation_required":
      return {
        subject: `Please confirm order ${reference}`,
        body:
          `We need to confirm order ${reference} before we dispatch it.\n\n` +
          `We will call you on the number you provided. No payment is needed until the courier arrives.` +
          SUPPORT_LINE(data),
      };

    case "order.cod_confirmed":
      return {
        subject: `Order ${reference} confirmed`,
        body:
          `Order ${reference} is confirmed and is being prepared for dispatch.\n\n` +
          `Please have ${total} ready in cash for the courier.` +
          SUPPORT_LINE(data),
      };

    case "payment.confirmed":
      return {
        subject: `Payment confirmed for order ${reference}`,
        body:
          `We have received your payment of ${total} for order ${reference}.\n\n` +
          `Your order is now being prepared for dispatch.` +
          SUPPORT_LINE(data),
      };

    case "order.shipped":
      return {
        subject: `Order ${reference} has shipped`,
        body:
          `Order ${reference} is on its way.\n\n` +
          (data.tracking_number ? `Tracking number: ${data.tracking_number}\n` : "") +
          (data.tracking_url ? `Track it here: ${data.tracking_url}\n` : "") +
          (data.eta ? `Estimated delivery: ${data.eta}\n` : "") +
          SUPPORT_LINE(data),
      };

    case "order.delivered":
      return {
        subject: `Order ${reference} delivered`,
        body:
          `Order ${reference} has been delivered.\n\n` +
          `The warranty recorded at purchase applies from today. Keep this reference for any claim.` +
          SUPPORT_LINE(data),
      };

    case "order.cancelled":
      return {
        subject: `Order ${reference} cancelled`,
        body:
          `Order ${reference} has been cancelled.` +
          (data.reason ? `\n\nReason: ${data.reason}` : "") +
          `\n\nIf you paid for this order, the refund is being processed.` +
          SUPPORT_LINE(data),
      };

    case "refund.completed":
      return {
        subject: `Refund issued for order ${reference}`,
        body:
          `We have refunded ${data.amount != null ? formatPkr(data.amount) : total} for order ${reference}.\n\n` +
          `Your bank may take a few working days to show it.` +
          SUPPORT_LINE(data),
      };

    case "return.status_changed":
      return {
        subject: `Return update for order ${reference}`,
        body:
          `The return you requested for order ${reference} is now: ${data.status ?? "updated"}.` +
          (data.reason ? `\n\n${data.reason}` : "") +
          SUPPORT_LINE(data),
      };

    case "cod.verification_code":
      return {
        subject: `Your confirmation code`,
        body:
          `Your order confirmation code is ${data.code}.\n\n` +
          `It expires in ${data.expires_in_minutes ?? 10} minutes. ` +
          // Stated explicitly because this is exactly the message a fraudster imitates.
          `We will never ask you for this code by phone, and we will never ask for card or ` +
          `bank details to confirm an order.`,
      };

    /*
     * Installment messages.
     *
     * None of them contain a CNIC, a document or a full address (ADR-024): a notification
     * is the least controlled copy of anything it carries. None of them promise an outcome
     * either — "under review" does not become "you are approved", because the reviewer has
     * not decided yet and a customer who reads it as a yes will make plans on it.
     */
    case "installment.received":
      return {
        subject: `We have your installment application ${data.application_reference ?? ""}`.trim(),
        body:
          `Thanks. We have your application ${data.application_reference ?? ""} and it is with our team.

` +
          `Plan: Rs ${(data.advance ?? 0).toLocaleString("en-PK")} advance, then ` +
          `Rs ${(data.monthly ?? 0).toLocaleString("en-PK")} a month for ${data.tenure_months ?? 0} months.

` +
          `We have set your handset aside while we review this. You will hear from us either way.` +
          SUPPORT_LINE(data),
      };

    case "installment.information_required":
      return {
        subject: `We need one more thing for application ${data.application_reference ?? ""}`.trim(),
        body:
          `We have started reviewing application ${data.application_reference ?? ""} and need something else before we can decide.

` +
          (data.missing ? `${data.missing}

` : "") +
          `Your handset stays reserved in the meantime.` +
          SUPPORT_LINE(data),
      };

    case "installment.approved":
      return {
        subject: `Application ${data.application_reference ?? ""} is approved`.trim(),
        body:
          `Your installment application ${data.application_reference ?? ""} is approved.

` +
          `Plan: Rs ${(data.advance ?? 0).toLocaleString("en-PK")} advance, then ` +
          `Rs ${(data.monthly ?? 0).toLocaleString("en-PK")} a month for ${data.tenure_months ?? 0} months. ` +
          `Total ${total || "as shown on your plan"}.

` +
          `We will call you to arrange the advance and the paperwork. ` +
          // Said plainly because this is the message a fraudster would imitate.
          `We will never ask for card or bank details over the phone.` +
          SUPPORT_LINE(data),
      };

    case "installment.rejected":
      return {
        subject: `We could not approve application ${data.application_reference ?? ""}`.trim(),
        body:
          `We are not able to approve installment application ${data.application_reference ?? ""}.

` +
          (data.reason ? `${data.reason}

` : "") +
          `Your handset is no longer reserved. You can still buy it outright or with cash on delivery.` +
          SUPPORT_LINE(data),
      };

    case "installment.expired":
      return {
        subject: `Application ${data.application_reference ?? ""} has expired`.trim(),
        body:
          `We did not manage to finish reviewing application ${data.application_reference ?? ""} in time, ` +
          `so the handset we set aside has been released.

` +
          `Nothing has been charged. You are welcome to apply again.` +
          SUPPORT_LINE(data),
      };
  }
}
