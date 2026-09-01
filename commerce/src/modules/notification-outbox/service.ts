import { AbstractNotificationProviderService } from "@medusajs/framework/utils";
import type { Logger, ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types";
import {
  renderNotification,
  type NotificationTemplate,
  type TemplateData,
} from "../../lib/notifications/templates";

/**
 * Outbox notification provider.
 *
 * No email or SMS provider is contracted yet. Rather than leave notifications unbuilt —
 * which is what left a customer with no confirmation of an order they had just paid for —
 * this renders each message and hands it to the Notification module, which persists it.
 * The persisted row *is* the outbox: every message that would have been sent is visible in
 * the admin and can be replayed when a real provider is configured.
 *
 * ADR-006: swapping in SendGrid or a Pakistani SMS gateway is a change to `medusa-config.ts`
 * and nothing else.
 */

interface Options {
  /** Echo the rendered body into the log. Useful locally; noisy and PII-adjacent in production. */
  logBody?: boolean;
}

class OutboxNotificationProvider extends AbstractNotificationProviderService {
  static identifier = "outbox";

  protected readonly logger_: Logger;
  protected readonly options_: Options;

  constructor({ logger }: { logger: Logger }, options: Options) {
    super();
    this.logger_ = logger;
    this.options_ = options ?? {};
  }

  async send(
    notification: ProviderSendNotificationDTO,
  ): Promise<ProviderSendNotificationResultsDTO> {
    const rendered = renderNotification(
      notification.template as NotificationTemplate,
      (notification.data ?? {}) as TemplateData,
    );

    // TRD section 13: logs never carry unnecessary PII. The recipient is masked, so an
    // operator can still correlate a message with a customer without the log becoming a
    // contact list.
    this.logger_.info(
      `[notification] ${notification.channel} · ${notification.template} → ${mask(notification.to)} · ${rendered.subject}`,
    );

    if (this.options_.logBody) {
      this.logger_.info(`[notification] body:\n${rendered.body}`);
    }

    // The provider result carries only an id. The rendered text reaches the stored record
    // through the notification's own `content`, set by the caller in lib/notifications/send.ts.
    return { id: `outbox_${Date.now()}` };
  }
}

/** `ali@example.com` → `a**@example.com`; `+923001234567` → `+92******4567`. */
function mask(to: string): string {
  if (!to) return "(unknown)";

  if (to.includes("@")) {
    const [local = "", domain = ""] = to.split("@");
    return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
  }

  return to.length <= 6 ? "*".repeat(to.length) : `${to.slice(0, 3)}${"*".repeat(to.length - 7)}${to.slice(-4)}`;
}

export default OutboxNotificationProvider;
