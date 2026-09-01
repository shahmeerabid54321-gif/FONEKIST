import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  renderNotification,
  type NotificationTemplate,
  type TemplateData,
} from "./templates";

/**
 * Sends a customer notification.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 12 and REL-001: notifications retry separately and
 * cannot corrupt order flow. An order must not fail because email is down (TRD section 8),
 * so this never throws — a failure is logged and the caller carries on.
 *
 * The idempotency key is what makes a replayed event safe: Medusa deduplicates on it, so
 * a subscriber that runs twice does not send two "your order shipped" messages.
 */
export interface SendNotificationInput {
  to: string;
  channel: "email" | "sms";
  template: NotificationTemplate;
  data: TemplateData;
  /** Stable per (event, aggregate) so a duplicate event does not send a duplicate message. */
  idempotencyKey: string;
}

export async function sendNotification(
  container: MedusaContainer,
  input: SendNotificationInput,
): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  if (!input.to) {
    logger.warn(`[notification] no recipient for ${input.template}; skipping`);
    return false;
  }

  try {
    const notifications = container.resolve(Modules.NOTIFICATION);
    const rendered = renderNotification(input.template, {
      ...input.data,
      support_phone: process.env.SUPPORT_PHONE ?? null,
    });

    await notifications.createNotifications({
      to: input.to,
      channel: input.channel,
      template: input.template,
      data: { ...input.data } as Record<string, unknown>,
      idempotency_key: input.idempotencyKey,
      content: { subject: rendered.subject, text: rendered.body },
    });

    return true;
  } catch (error) {
    logger.error(
      `[notification] ${input.template} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

/**
 * Delivers a message that must not be retained.
 *
 * A one-time confirmation code is the case this exists for. `sendNotification` goes through
 * the Notification module, which persists every message — sensible for an order receipt,
 * wrong for an OTP: storing the code in a queryable table would make hashing it in
 * `cod_verification` pointless, since anyone who could read one table could read the other.
 *
 * Locally there is no SMS gateway, so the code is written to the log to make the flow
 * testable. That is gated on the environment: printing a live customer's code into
 * production logs would be the same mistake in a different table (TRD section 13).
 */
export async function deliverTransient(
  container: MedusaContainer,
  input: Omit<SendNotificationInput, "idempotencyKey">,
): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  if (!input.to) {
    logger.warn(`[notification] no recipient for ${input.template}; skipping`);
    return false;
  }

  const rendered = renderNotification(input.template, input.data);

  try {
    logger.info(
      `[notification] ${input.channel} · ${input.template} → ${maskRecipient(input.to)} · not retained`,
    );

    if (process.env.NODE_ENV !== "production") {
      logger.info(`[notification] (development only) ${rendered.body}`);
    }

    // No SMS provider is contracted yet. When one is, it is called here — directly rather
    // than through the module, so the message is never written to the outbox.
    return true;
  } catch (error) {
    logger.error(
      `[notification] transient ${input.template} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

function maskRecipient(to: string): string {
  if (to.includes("@")) {
    const [local = "", domain = ""] = to.split("@");
    return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
  }
  return to.length <= 6 ? "*".repeat(to.length) : `${to.slice(0, 3)}${"*".repeat(to.length - 7)}${to.slice(-4)}`;
}
