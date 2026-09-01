import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { warrantyLabel } from "@pk/contracts";
import { WARRANTY_MODULE } from "../../../../modules/warranty";
import type WarrantyService from "../../../../modules/warranty/service";
import { fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * GET /store/electronics/warranty-labels?product_ids=a,b,c
 *
 * Returns `{ [productId]: "1-year manufacturer warranty" }` for a set of products.
 *
 * CUST-008 requires warranty to be visible wherever a product is presented, including
 * listing cards. Batching avoids one request per card on a 24-product grid.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const productIds = String(req.query.product_ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (productIds.length === 0) {
      res.json(ok({ labels: {} }, requestId));
      return;
    }

    const warranty: WarrantyService = req.scope.resolve(WARRANTY_MODULE);

    const assignments = (await warranty.listProductWarrantyAssignments(
      { product_id: productIds },
      { relations: ["policy"] },
    )) as unknown as {
      product_id: string;
      variant_id: string | null;
      policy: Parameters<typeof warrantyLabel>[0];
    }[];

    const labels: Record<string, string> = {};
    for (const assignment of assignments) {
      // Product-level assignments win for a listing card: it represents the product, not
      // one variant.
      if (assignment.variant_id !== null && labels[assignment.product_id]) continue;
      labels[assignment.product_id] = warrantyLabel(assignment.policy);
    }

    // A product with no assignment states it explicitly rather than showing nothing.
    for (const id of productIds) {
      labels[id] ??= "No warranty";
    }

    res.json(ok({ labels }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
