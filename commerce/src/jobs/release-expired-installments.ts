import { randomUUID } from "node:crypto";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows";
import { buildEvent } from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../modules/installments";
import type InstallmentsService from "../modules/installments/service";
import { sendNotification } from "../lib/notifications/send";

/**
 * Expires applications whose reservation has lapsed, and releases the stock.
 *
 * This is the compensating flow the original design left out. An application nobody reviews
 * still holds a handset, and a handset held indefinitely by an abandoned application is
 * indistinguishable from one that was sold: the last unit disappears from the catalogue and
 * nobody can say why.
 *
 * Cancelling the order is what releases the inventory. Medusa reserved it when the order
 * was created, so unwinding that is the release; a second reservation of our own would have
 * double-counted the same unit (D3, INST-009).
 *
 * The customer is told. An application that lapses in silence is how somebody ends up
 * waiting weeks for a phone nobody is sending.
 */
export default async function releaseExpiredInstallments(container: MedusaContainer): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const installments: InstallmentsService = container.resolve(INSTALLMENTS_MODULE);

  const expired = await installments.listExpiredReservations();
  if (expired.length === 0) return;

  for (const application of expired) {
    try {
      await installments.transition(application.id, "expired", {
        actor: "system",
        note: "The review window passed without a decision.",
      });

      if (application.order_id) {
        await cancelOrderWorkflow(container)
          .run({ input: { order_id: application.order_id } })
          .catch((error) => {
            // The expiry itself is already recorded. A failure to cancel is loud rather
            // than fatal, because leaving the application `submitted` would mean it is
            // picked up again on the next run and expired twice.
            logger.error(
              `[installments] could not cancel order ${application.order_id} for expired ${application.reference}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          });
      }

      await installments.updateInstallmentApplications({
        selector: { id: application.id },
        data: { reserved_until: null },
      } as never);

      await sendNotification(container, {
        to: application.applicant_email,
        channel: "email",
        template: "installment.expired",
        data: { application_reference: application.reference },
        idempotencyKey: `installment-expired:${application.id}`,
      });

      const eventBus = container.resolve(Modules.EVENT_BUS);
      const domainEvent = buildEvent("installment.decision.recorded.v1", {
        eventId: `evt_${randomUUID()}`,
        aggregateId: application.id,
        correlationId: `job_${randomUUID()}`,
        data: {
          application_id: application.id,
          order_id: application.order_id,
          decision: "expired" as const,
        },
      });
      await eventBus.emit({ name: domainEvent.event_type, data: domainEvent });

      logger.info(`[installments] expired ${application.reference} and released its stock`);
    } catch (error) {
      // One bad row must not stop the rest: the whole point of this job is that stock does
      // not stay held, and a loop that aborts on the first failure holds everything after it.
      logger.error(
        `[installments] failed to expire ${application.reference}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export const config = {
  name: "release-expired-installments",
  // Every fifteen minutes. The TTL is measured in days, so this only needs to be frequent
  // enough that "released" is true within a useful margin of the deadline.
  schedule: "*/15 * * * *",
};
