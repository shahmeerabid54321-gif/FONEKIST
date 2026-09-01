import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { warrantyLabel } from "@pk/contracts";
import { ELECTRONICS_ATTRIBUTES_MODULE } from "../../../../modules/electronics-attributes";
import { WARRANTY_MODULE } from "../../../../modules/warranty";
import type ElectronicsAttributesService from "../../../../modules/electronics-attributes/service";
import type WarrantyService from "../../../../modules/warranty/service";
import { ok, fail, requestIdOf } from "../../../../lib/http";

/**
 * GET /store/electronics/product-details?product_id=...&variant_id=...
 *
 * Returns the rendered specification table and the current catalog warranty for a product.
 * Public read: no authentication, and it exposes only published-safe fields — no cost,
 * supplier or admin notes (08_DATA_MODEL.md section 14).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const productId = String(req.query.product_id ?? "").trim();
    const variantId = req.query.variant_id ? String(req.query.variant_id).trim() : null;

    if (!productId) {
      res.status(400).json(
        fail(
          { code: "VALIDATION_ERROR", message: "product_id is required.", field_errors: { product_id: ["Required."] } },
          requestId,
        ),
      );
      return;
    }

    const attributes: ElectronicsAttributesService = req.scope.resolve(ELECTRONICS_ATTRIBUTES_MODULE);
    const warranty: WarrantyService = req.scope.resolve(WARRANTY_MODULE);

    const [specs, policy] = await Promise.all([
      attributes.getRenderedSpecifications(productId, variantId),
      warranty.resolvePolicy(productId, variantId),
    ]);

    res.json(
      ok(
        {
          specs,
          warranty: policy
            ? {
                label: warrantyLabel(policy),
                type: policy.type,
                provider_name: policy.provider_name,
                duration_value: policy.duration_value,
                duration_unit: policy.duration_unit,
                coverage_summary: policy.coverage_summary,
                claim_instructions: policy.claim_instructions,
                terms_reference: policy.terms_reference,
              }
            : null,
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
