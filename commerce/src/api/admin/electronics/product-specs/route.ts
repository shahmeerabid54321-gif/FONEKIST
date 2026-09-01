import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ELECTRONICS_ATTRIBUTES_MODULE } from "../../../../modules/electronics-attributes";
import { WARRANTY_MODULE } from "../../../../modules/warranty";
import type ElectronicsAttributesService from "../../../../modules/electronics-attributes/service";
import type WarrantyService from "../../../../modules/warranty/service";
import { AttributeValueError } from "../../../../modules/electronics-attributes/normalize";
import { fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * Admin specification management.
 *
 * GET  — the attribute schema for a category plus the product's current values, so the
 *        admin form can render the right fields (ADM-005).
 * POST — writes values, and reports which required specs are still missing so a catalog
 *        manager knows what blocks publish (ADM-001, data model section 17).
 *
 * Admin routes are authenticated and role-checked by Medusa's admin middleware before
 * reaching this handler (SEC-002).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const productId = String(req.query.product_id ?? "").trim();
    const categoryId = String(req.query.category_id ?? "").trim();

    if (!productId) {
      res.status(400).json(
        fail({ code: "VALIDATION_ERROR", message: "product_id is required.", field_errors: { product_id: ["Required."] } }, requestId),
      );
      return;
    }

    const attributes: ElectronicsAttributesService = req.scope.resolve(ELECTRONICS_ATTRIBUTES_MODULE);
    const warranty: WarrantyService = req.scope.resolve(WARRANTY_MODULE);

    const [schema, values, policy, missing] = await Promise.all([
      categoryId ? attributes.getCategoryAttributes(categoryId) : Promise.resolve([]),
      attributes.listProductAttributeValues({ product_id: productId }, { relations: ["attribute"] }),
      warranty.resolvePolicy(productId),
      categoryId
        ? attributes.findMissingRequiredSpecifications(productId, categoryId)
        : Promise.resolve([]),
    ]);

    res.json(ok({ schema, values, warranty: policy, missing_required: missing }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const body = req.body as {
      product_id?: string;
      category_id?: string;
      specs?: { key: string; value: unknown; variant_id?: string | null }[];
    };

    if (!body.product_id || !Array.isArray(body.specs)) {
      res.status(400).json(
        fail({ code: "VALIDATION_ERROR", message: "product_id and specs are required." }, requestId),
      );
      return;
    }

    const attributes: ElectronicsAttributesService = req.scope.resolve(ELECTRONICS_ATTRIBUTES_MODULE);

    await attributes.setProductSpecifications(
      body.product_id,
      body.specs.map((spec) => ({
        key: spec.key,
        value: spec.value,
        variantId: spec.variant_id ?? null,
        source: "admin",
      })),
    );

    const missing = body.category_id
      ? await attributes.findMissingRequiredSpecifications(body.product_id, body.category_id)
      : [];

    res.json(ok({ saved: body.specs.length, missing_required: missing }, requestId));
  } catch (error) {
    // A rejected value is the catalog manager's mistake, not a server fault, so it is
    // reported as a field error they can act on rather than a 500.
    if (error instanceof AttributeValueError) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: error.message,
            field_errors: { [error.attributeKey]: [error.message] },
          },
          requestId,
        ),
      );
      return;
    }

    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
