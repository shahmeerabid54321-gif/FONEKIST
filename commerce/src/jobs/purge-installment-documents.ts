import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { INSTALLMENTS_MODULE } from "../modules/installments";
import type InstallmentsService from "../modules/installments/service";
import { resolveDocumentStore } from "../lib/document-storage";

/**
 * Deletes identity data whose retention period has passed (SEC-007, ADR-025).
 *
 * What is deleted: the document bytes, and the two CNIC columns.
 *
 * What is kept, deliberately: the application row, the decision and its note, the document
 * checksums, the consent version and text, and the audit trail. FONEKIST is the lender, so
 * a decision has to remain auditable long after the identity documents behind it are gone
 * — deleting the record along with the data would destroy the evidence that the process was
 * followed, which is the opposite of what a retention policy is for.
 *
 * The clock runs from the decision, not from submission: for a rejection or cancellation it
 * is 90 days from that decision, and for an approved agreement 90 days from settlement. The
 * original design's 30 days from decision would have deleted the file while the receivable
 * it evidences was still being collected.
 */
export default async function purgeInstallmentDocuments(container: MedusaContainer): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const installments: InstallmentsService = container.resolve(INSTALLMENTS_MODULE);

  const due = await installments.listDueForPurge();
  if (due.length === 0) return;

  const store = resolveDocumentStore();

  for (const application of due) {
    try {
      const documents = (await installments.listInstallmentDocuments({
        application_id: application.id,
      })) as unknown as { id: string; storage_key: string; bytes_deleted_at: Date | null }[];

      for (const document of documents) {
        if (document.bytes_deleted_at) continue;
        await store.delete(document.storage_key);
        await installments.updateInstallmentDocuments({
          selector: { id: document.id },
          // The checksum stays. It is what lets an auditor confirm which file was reviewed
          // without the file still existing.
          data: { bytes_deleted_at: new Date(), storage_key: "" },
        } as never);
      }

      await installments.updateInstallmentApplications({
        selector: { id: application.id },
        data: { applicant_cnic: null, guarantor_cnic: null, applicant_dob: null, purged_at: new Date() },
      } as never);

      await installments.recordAudit({
        application_id: application.id,
        action: "retention.purged",
        actor: "system",
        detail: { documents: documents.length },
      });

      logger.info(`[installments] purged identity data for ${application.reference}`);
    } catch (error) {
      logger.error(
        `[installments] failed to purge ${application.reference}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export const config = {
  name: "purge-installment-documents",
  // Daily, off-peak. Retention is measured in months; running it more often would only
  // move the deletion a few hours earlier and compete with the working day.
  schedule: "30 2 * * *",
};
