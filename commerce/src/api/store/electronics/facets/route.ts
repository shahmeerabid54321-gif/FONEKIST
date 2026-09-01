import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ELECTRONICS_ATTRIBUTES_MODULE } from "../../../../modules/electronics-attributes";
import type ElectronicsAttributesService from "../../../../modules/electronics-attributes/service";
import { fail, ok, requestIdOf } from "../../../../lib/http";

/**
 * GET /store/electronics/facets?category_id=...&product_ids=a,b,c
 *
 * Returns the filterable attributes for a category together with the values actually
 * present in the current result set and their counts.
 *
 * CUST-004 requires category-specific filters; UX spec section 4 asks for counts where
 * practical and for selected values to stay visible. Counting from the current result set
 * rather than the whole catalog is what makes the counts truthful.
 */
/**
 * Above this many distinct values a numeric facet becomes a range rather than a list.
 * Eight covers the realistic memory/storage ladders (4/8/12/16/32/64) while keeping a
 * continuous measure like screen size on a range.
 */
const DISCRETE_VALUE_LIMIT = 8;

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const categoryId = String(req.query.category_id ?? "").trim();
    if (!categoryId) {
      res.status(400).json(
        fail(
          { code: "VALIDATION_ERROR", message: "category_id is required.", field_errors: { category_id: ["Required."] } },
          requestId,
        ),
      );
      return;
    }

    const productIds = String(req.query.product_ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const attributes: ElectronicsAttributesService = req.scope.resolve(ELECTRONICS_ATTRIBUTES_MODULE);

    const assigned = (await attributes.getCategoryAttributes(categoryId)).filter((a) => a.filterable);
    if (assigned.length === 0 || productIds.length === 0) {
      res.json(ok({ facets: [] }, requestId));
      return;
    }

    const values = await attributes.listProductAttributeValues({
      product_id: productIds,
      attribute_id: assigned.map((attribute) => attribute.id),
    });

    const facets = assigned.map((attribute) => {
      const relevant = values.filter((value) => value.attribute_id === attribute.id);

      const isNumeric = attribute.value_type === "int" || attribute.value_type === "decimal";

      const numbers = isNumeric
        ? relevant.map((value) => Number(value.value_number)).filter((n) => Number.isFinite(n))
        : [];
      const distinctNumbers = [...new Set(numbers)];

      // A numeric attribute is only a range when it genuinely varies continuously.
      // Memory and storage take a handful of discrete values that several products share,
      // and customers pick one ("16 GB") — those are checkbox facets. Weight is different:
      // every product has its own figure, so a tick list would offer one product per row
      // and discriminate nothing. Clustering, not just cardinality, is the real signal.
      const clusters = distinctNumbers.length < numbers.length;
      if (isNumeric && (distinctNumbers.length > DISCRETE_VALUE_LIMIT || !clusters)) {
        return {
          key: attribute.key,
          label: attribute.name,
          type: "range" as const,
          group: attribute.group,
          unit: attribute.unit,
          values: [],
          min: numbers.length > 0 ? Math.min(...numbers) : undefined,
          max: numbers.length > 0 ? Math.max(...numbers) : undefined,
        };
      }

      if (isNumeric) {
        const counts = new Map<number, number>();
        for (const number of numbers) counts.set(number, (counts.get(number) ?? 0) + 1);

        return {
          key: attribute.key,
          label: attribute.name,
          type: "checkbox" as const,
          group: attribute.group,
          unit: attribute.unit,
          values: [...counts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([value, count]) => ({
              value: String(value),
              label: attribute.unit ? `${value} ${attribute.unit}` : String(value),
              count,
              selected: false,
            })),
        };
      }

      const counts = new Map<string, number>();
      for (const value of relevant) {
        const selected =
          (value.value_enum as string[] | null) ??
          (value.value_bool !== null && value.value_bool !== undefined
            ? [String(value.value_bool)]
            : value.value_string
              ? [value.value_string]
              : []);

        for (const entry of selected) {
          counts.set(entry, (counts.get(entry) ?? 0) + 1);
        }
      }

      const enumLabels = new Map(
        ((attribute.enum_values ?? []) as { value: string; label: string }[]).map((entry) => [
          entry.value,
          entry.label,
        ]),
      );

      const boolLabels: Record<string, string> = { true: "Yes", false: "No" };

      return {
        key: attribute.key,
        label: attribute.name,
        // Both single and multi enums render as checkbox lists: a customer filtering a
        // catalogue expects to be able to select more than one brand or panel type.
        type: "checkbox" as const,
        group: attribute.group,
        unit: attribute.unit,
        values: [...counts.entries()]
          .map(([value, count]) => ({
            value,
            label: enumLabels.get(value) ?? boolLabels[value] ?? value,
            count,
            selected: false,
          }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      };
    });

    // A facet with nothing to choose between is noise, not a filter: a checkbox list with
    // one option, or a range whose bounds are equal, filters out nothing and only adds
    // weight to the sidebar.
    const usable = facets.filter((facet) =>
      facet.type === "range"
        ? facet.min != null && facet.max != null && facet.min < facet.max
        : facet.values.length > 1,
    );

    res.json(ok({ facets: usable }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
