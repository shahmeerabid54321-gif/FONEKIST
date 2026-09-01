import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INSTALLMENT_STATE_LABEL, formatCnic, maskCnic } from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../../modules/installments";
import type InstallmentsService from "../../../../modules/installments/service";
import { fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * GET /admin/installments/:id
 *
 * The reviewer's detail view, and the only place a full CNIC is ever returned.
 *
 * Two things make that acceptable rather than a hole:
 *
 *  - the full value is returned **only** when `?disclose=cnic` is passed, so opening the
 *    page to read a note does not disclose the number as a side effect;
 *  - every disclosure appends an audit row before the response is written. ADR-024 requires
 *    it, and "only reviewers can see it" is a claim rather than a control until there is a
 *    record of which reviewer saw what and when.
 *
 * Documents are listed but never inlined. A reviewer requests a signed, short-lived link
 * per document, which is audited separately.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const applicationId = String(req.params.id ?? "");
    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);

    const row = (await installments
      .retrieveInstallmentApplication(applicationId)
      .catch(() => null)) as never as Parameters<typeof installments.toSafeView>[0] | null;

    if (!row) {
      res.status(404).json(
        fail({ code: "NOT_FOUND", message: "No such application." }, requestId),
      );
      return;
    }

    const actor = req.auth_context?.actor_id ?? "unknown";
    const disclose = String(req.query.disclose ?? "") === "cnic";

    if (disclose) {
      await installments.recordDisclosure(applicationId, actor, "cnic");
    }

    const safe = installments.toSafeView(row);

    const documents = (await installments.listInstallmentDocuments({
      application_id: applicationId,
    })) as unknown as {
      id: string;
      kind: string;
      mime_type: string;
      size_bytes: number;
      scan_status: string;
      bytes_deleted_at: Date | null;
    }[];

    const audit = await installments.listInstallmentAuditEvents(
      { application_id: applicationId },
      { order: { created_at: "DESC" }, take: 100 },
    );

    res.json(
      ok(
        {
          ...safe,
          state_label: INSTALLMENT_STATE_LABEL[safe.state],
          applicant: {
            ...safe.applicant,
            cnic: disclose && row.applicant_cnic ? formatCnic(row.applicant_cnic) : null,
            employer_name: row.employer_name,
            address: row.delivery_address,
          },
          guarantor: {
            ...safe.guarantor,
            cnic: disclose && row.guarantor_cnic ? formatCnic(row.guarantor_cnic) : null,
          },
          // Belt and braces: the masked form is always present, so a client that renders
          // the wrong field still cannot leak the number.
          applicant_cnic_masked: row.applicant_cnic ? maskCnic(row.applicant_cnic) : null,
          documents: documents.map((document) => ({
            id: document.id,
            kind: document.kind,
            mime_type: document.mime_type,
            size_bytes: document.size_bytes,
            scan_status: document.scan_status,
            // A document that has not been scanned clean cannot be opened at all.
            openable: document.scan_status === "clean" && document.bytes_deleted_at === null,
            deleted: document.bytes_deleted_at !== null,
          })),
          audit,
          purge_after: row.purge_after,
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
