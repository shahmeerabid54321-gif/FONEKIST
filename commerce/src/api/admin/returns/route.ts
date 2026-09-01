import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { RETURNS_MODULE } from "../../../modules/returns";
import type ReturnsService from "../../../modules/returns/service";
import { RETURN_REASON_LABEL, type ReturnReasonCode } from "../../../modules/returns/eligibility";
import { fail, ok, requestIdOf } from "../../../lib/http";

/**
 * GET /admin/returns?order_id=...
 *
 * The return requests an operator has to act on. Scoped to an order when an order id is
 * given, so the order page widget can show only what is relevant to it (ADM-013).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const orderId = String(req.query.order_id ?? "").trim();

    const returns: ReturnsService = req.scope.resolve(RETURNS_MODULE);
    const requests = (await returns.listReturnRequests(
      orderId ? { order_id: orderId } : {},
      { relations: ["items"], order: { created_at: "DESC" } },
    )) as unknown as {
      id: string;
      order_id: string;
      order_reference: string;
      status: string;
      reason_code: string;
      requested_resolution: string;
      notes: string | null;
      decision_reason: string | null;
      reviewed_by: string | null;
      created_at: string;
      items: { id: string; order_line_id: string; title: string; quantity: number }[];
    }[];

    res.json(
      ok(
        {
          requests: requests.map((request) => ({
            ...request,
            reason_label:
              RETURN_REASON_LABEL[request.reason_code as ReturnReasonCode] ?? request.reason_code,
          })),
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
