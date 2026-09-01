import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ExecArgs } from "@medusajs/framework/types";
import releaseExpiredInstallments from "../jobs/release-expired-installments";
import purgeInstallmentDocuments from "../jobs/purge-installment-documents";

/**
 * Runs the installment maintenance jobs once, on demand.
 *
 * The two jobs are scheduled, and ADR-019 notes that with the in-memory workflow engine a
 * schedule only runs while the process is up. That makes them awkward to exercise and
 * awkward to recover: if the process was down over the window in which a batch of
 * applications should have expired, their stock is still held and nothing will notice until
 * the next tick.
 *
 * So they are runnable by hand. Both are idempotent, both skip anything already handled,
 * and both are safe to run repeatedly.
 */
export default async function runInstallmentJobs({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  logger.info("[installments] releasing expired reservations...");
  await releaseExpiredInstallments(container);

  logger.info("[installments] purging documents past their retention date...");
  await purgeInstallmentDocuments(container);

  logger.info("[installments] maintenance complete.");
}
