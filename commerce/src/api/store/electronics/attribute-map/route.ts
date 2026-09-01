import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ELECTRONICS_ATTRIBUTES_MODULE } from "../../../../modules/electronics-attributes";
import type ElectronicsAttributesService from "../../../../modules/electronics-attributes/service";
import { fail, ok, requestIdOf } from "../../../../lib/http";
import { projectAttributeValues, type TypedAttributeValue } from "../../../../lib/attribute-projection";

/**
 * GET /store/electronics/attribute-map?product_ids=a,b,c
 *
 * Returns `{ [productId]: { [attributeKey]: string[] } }` — the normalised filter values
 * for a set of products, so the listing page can apply spec filters without issuing one
 * request per product.
 *
 * Public read: exposes only attribute keys and their public values, never cost, supplier
 * or admin notes (08_DATA_MODEL.md section 14).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const productIds = String(req.query.product_ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (productIds.length === 0) {
      res.json(ok({ products: {} }, requestId));
      return;
    }

    const attributes: ElectronicsAttributesService = req.scope.resolve(ELECTRONICS_ATTRIBUTES_MODULE);

    const values = (await attributes.listProductAttributeValues(
      { product_id: productIds },
      { relations: ["attribute"] },
    )) as unknown as TypedAttributeValue[];

    // Shared with the search indexer so a filter value and an indexed value can never
    // drift apart (see lib/attribute-projection.ts).
    const products = projectAttributeValues(values);

    res.json(ok({ products }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
