import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ELECTRONICS_ATTRIBUTES_MODULE } from "../../../../modules/electronics-attributes";
import type ElectronicsAttributesService from "../../../../modules/electronics-attributes/service";
import { fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * GET /store/electronics/card-specs?category_id=...&product_ids=a,b,c
 *
 * Returns the two or three decisive specifications for each product on a listing card.
 *
 * 06_DESIGN_SYSTEM.md section 13 and 05_UX_DESIGN_SPEC.md section 4 both put "2-3 decisive
 * specs" third in the card hierarchy, after the image and the title. Which specs are
 * decisive is category-specific, so the order comes from the category's own attribute
 * assignment order rather than a hard-coded list per category.
 */

/** Cards get three specs at most; more is the clutter the UX spec warns against. */
const MAX_CARD_SPECS = 3;

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const categoryId = String(req.query.category_id ?? "").trim();
    const productIds = String(req.query.product_ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    // Memory and storage are variant-scoped, and they are exactly the specs a laptop or
    // phone buyer scans a grid for. The caller therefore sends the variant each card
    // displays, positionally aligned with product_ids, so those values are not dropped.
    const variantIds = String(req.query.variant_ids ?? "")
      .split(",")
      .map((id) => id.trim());

    if (!categoryId || productIds.length === 0) {
      res.json(ok({ specs: {} }, requestId));
      return;
    }

    const attributes: ElectronicsAttributesService = req.scope.resolve(ELECTRONICS_ATTRIBUTES_MODULE);

    // Filterable attributes in the category's own sort order are exactly the ones the
    // merchant considers decisive for that category.
    const decisive = (await attributes.getCategoryAttributes(categoryId))
      .filter((attribute) => attribute.filterable)
      .slice(0, MAX_CARD_SPECS + 2);

    if (decisive.length === 0) {
      res.json(ok({ specs: {} }, requestId));
      return;
    }

    const specs: Record<string, { label: string; value: string }[]> = {};

    for (const [index, productId] of productIds.entries()) {
      const rendered = await attributes.getRenderedSpecifications(
        productId,
        variantIds[index] || null,
      );
      const byKey = new Map(rendered.map((spec) => [spec.key, spec]));

      specs[productId] = decisive
        .map((attribute) => byKey.get(attribute.key))
        .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
        .slice(0, MAX_CARD_SPECS)
        .map((spec) => ({ label: spec.label, value: spec.value }));
    }

    res.json(ok({ specs }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
