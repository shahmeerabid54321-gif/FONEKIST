import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INSTALLMENT_STATE_LABEL, INSTALLMENT_STATES, type InstallmentState } from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../modules/installments";
import type InstallmentsService from "../../../modules/installments/service";
import { fail, ok, requestIdOf } from "../../../lib/http";

/**
 * GET /admin/installments
 *
 * The review queue.
 *
 * Every row is the masked projection: names, plan figures and the last four digits of a
 * CNIC, never the number itself (ADR-024). A reviewer who needs the full value opens the
 * one application, and that read is audited. A list view that showed it would put a
 * hundred CNICs on one screen for every glance at the queue.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const state = String(req.query.state ?? "").trim();
    const filters: Record<string, unknown> = {};
    if (state && (INSTALLMENT_STATES as readonly string[]).includes(state)) {
      filters.state = state as InstallmentState;
    }

    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const rows = await installments.listInstallmentApplications(filters, {
      take: Math.min(100, Number(req.query.limit ?? 50)),
      skip: Number(req.query.offset ?? 0),
      order: { created_at: "DESC" },
    });

    const applications = (rows as never as Parameters<typeof installments.toSafeView>[0][]).map(
      (row) => {
        const safe = installments.toSafeView(row);
        return { ...safe, state_label: INSTALLMENT_STATE_LABEL[safe.state] };
      },
    );

    res.json(ok({ applications, count: applications.length }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
