import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INSTALLMENT_STATE_LABEL } from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../../modules/installments";
import type InstallmentsService from "../../../../modules/installments/service";
import { clientIpOf, fail, ok, requestIdOf } from "../../../../lib/http";
import { normalizePkMobile, phonesMatch } from "../../../../lib/phone-match";
import { rateLimit } from "../../../../lib/rate-limit";

/**
 * GET /store/installment-applications/:reference?phone=…
 *
 * Lets an applicant check where their application stands.
 *
 * Guest checkout is the default (ADR-008), so the reference plus the phone used on the
 * application is the second factor, exactly as for order lookup. An unknown reference and a
 * wrong phone give the identical response, so this cannot be used to discover which
 * references exist (SEC-004).
 *
 * The response is the masked projection. A status page never carries a CNIC, a document or
 * the reviewer's private note (ADR-024).
 */

const LIMIT = 10;
const WINDOW_SECONDS = 15 * 60;

function notFound(res: MedusaResponse, requestId: string): void {
  res.status(404).json(
    fail(
      {
        code: "NOT_FOUND",
        message: "We could not find an application with those details.",
      },
      requestId,
    ),
  );
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  const limit = rateLimit(`installment-status:${clientIpOf(req)}`, LIMIT, WINDOW_SECONDS);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfterSeconds));
    res.status(429).json(
      fail({ code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes." }, requestId),
    );
    return;
  }

  try {
    const reference = String(req.params.reference ?? "").trim().toUpperCase();
    const phone = normalizePkMobile(String(req.query.phone ?? ""));

    if (!reference || !phone) {
      notFound(res, requestId);
      return;
    }

    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const application = await installments.findByReference(reference);

    if (!application || !phonesMatch(application.applicant_phone, phone)) {
      notFound(res, requestId);
      return;
    }

    const safe = installments.toSafeView(application);

    res.json(
      ok(
        {
          reference: safe.reference,
          state: safe.state,
          state_label: INSTALLMENT_STATE_LABEL[safe.state],
          plan: safe.plan,
          reserved_until: safe.reserved_until,
          decided_at: safe.decided_at,
          created_at: safe.created_at,
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
