import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INSTALLMENTS_MODULE } from "../../../../../modules/installments";
import type InstallmentsService from "../../../../../modules/installments/service";
import {
  resolveDocumentStore,
  signDocumentLink,
  verifyDocumentLink,
} from "../../../../../lib/document-storage";
import { fail, ok, requestIdOf } from "../../../../../lib/http";

/**
 * GET /admin/installments/documents/:id
 *
 * Two behaviours behind one path:
 *
 *  - without a token, it issues a short-lived signed link for this document and this
 *    reviewer, and audits the request;
 *  - with `?token=…`, it serves the bytes, verifying the signature and the expiry.
 *
 * The bytes are never addressable without a valid token, the token is bound to one document
 * and one reviewer, and it expires in five minutes. A link that lives in a browser history
 * for a week is a CNIC that lives in a browser history for a week.
 *
 * A document that has not been scanned clean is refused outright. That is what makes the
 * scanner a control rather than a decoration: with none configured the verdict is `error`,
 * and nothing can be opened (SEC-005).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const secret = process.env.DOCUMENT_LINK_SECRET;
    if (!secret || secret.length < 32) {
      res.status(500).json(
        fail(
          {
            code: "INTERNAL_ERROR",
            message: "Document access is not configured. Set DOCUMENT_LINK_SECRET.",
          },
          requestId,
        ),
      );
      return;
    }

    const documentId = String(req.params.id ?? "");
    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const actor = req.auth_context?.actor_id ?? "unknown";

    const document = (await installments
      .retrieveInstallmentDocument(documentId)
      .catch(() => null)) as unknown as {
      id: string;
      application_id: string | null;
      storage_key: string;
      mime_type: string;
      scan_status: string;
      bytes_deleted_at: Date | null;
    } | null;

    if (!document) {
      res.status(404).json(fail({ code: "NOT_FOUND", message: "No such document." }, requestId));
      return;
    }

    if (document.scan_status !== "clean") {
      res.status(409).json(
        fail(
          {
            code: "CONFLICT",
            message:
              document.scan_status === "infected"
                ? "That file did not pass the security scan and cannot be opened."
                : "That file has not been scanned yet, so it cannot be opened.",
          },
          requestId,
        ),
      );
      return;
    }

    if (document.bytes_deleted_at) {
      res.status(410).json(
        fail(
          { code: "NOT_FOUND", message: "That document was deleted under our retention policy." },
          requestId,
        ),
      );
      return;
    }

    const token = typeof req.query.token === "string" ? req.query.token : null;

    if (!token) {
      const link = signDocumentLink(documentId, actor, secret);
      if (document.application_id) {
        await installments.recordDisclosure(document.application_id, actor, "document", documentId);
      }
      res.json(ok({ document_id: documentId, ...link }, requestId));
      return;
    }

    const verified = verifyDocumentLink(token, secret);
    // Bound to the document as well as signed: a valid token for one document must not
    // open another, or the signature would only prove that some reviewer asked for
    // something at some point.
    if (!verified || verified.documentId !== documentId) {
      res.status(403).json(
        fail({ code: "FORBIDDEN", message: "That link is not valid or has expired." }, requestId),
      );
      return;
    }

    const bytes = await resolveDocumentStore().get(document.storage_key);

    res.setHeader("content-type", document.mime_type);
    // Never rendered inline. A PDF opened in the tab is a document one keystroke away from
    // being saved somewhere it should not be, and it must not be cached anywhere.
    res.setHeader("content-disposition", `attachment; filename="${documentId}"`);
    res.setHeader("cache-control", "no-store, private");
    res.setHeader("x-content-type-options", "nosniff");
    res.status(200).send(bytes);
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
