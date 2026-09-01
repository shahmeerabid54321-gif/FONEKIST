import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { WARRANTY_MODULE } from "../../../../modules/warranty";
import type WarrantyService from "../../../../modules/warranty/service";
import { fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * GET /admin/electronics/order-warranty?order_id=...
 *
 * Returns the purchase-time warranty snapshots for an order so support can answer a claim
 * from what was actually promised (WAR-001), not from the current catalog.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const orderId = String(req.query.order_id ?? "").trim();
    if (!orderId) {
      res.status(400).json(
        fail({ code: "VALIDATION_ERROR", message: "order_id is required." }, requestId),
      );
      return;
    }

    const warranty: WarrantyService = req.scope.resolve(WARRANTY_MODULE);
    const snapshots = await warranty.getOrderSnapshots(orderId);

    res.json(ok({ snapshots }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
