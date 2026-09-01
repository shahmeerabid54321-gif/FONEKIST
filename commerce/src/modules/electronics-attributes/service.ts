import { MedusaService } from "@medusajs/framework/utils";
import {
  AttributeDefinition,
  AttributeGroup,
  CategoryAttributeAssignment,
  ProductAttributeValue,
} from "./models";
import {
  AttributeValueError,
  formatAttributeValue,
  normalizeAttributeValue,
  type AttributeValueType,
} from "./normalize";

type DefinitionRecord = {
  id: string;
  key: string;
  name: string;
  value_type: AttributeValueType;
  unit: string | null;
  enum_values: { value: string; label: string }[] | null;
  filterable: boolean;
  comparable: boolean;
  searchable: boolean;
  variant_scoped: boolean;
  group_id?: string | null;
};

export interface SpecInput {
  /** Attribute key such as `ram_gb`. */
  key: string;
  value: unknown;
  variantId?: string | null;
  displayOverride?: string | null;
  source?: string | null;
}

export interface RenderedSpec {
  key: string;
  label: string;
  value: string;
  group: string | null;
  groupOrder: number;
  sortOrder: number;
  comparable: boolean;
}

/**
 * Electronics attribute service.
 *
 * Owns typed specification storage and the rules around it. Deliberately does not touch
 * Medusa's Product module directly — products are referenced by id and joined through
 * module links, keeping the module boundary intact (ADR-005).
 */
class ElectronicsAttributesService extends MedusaService({
  AttributeGroup,
  AttributeDefinition,
  CategoryAttributeAssignment,
  ProductAttributeValue,
}) {
  /**
   * Writes specification values for a product, replacing any existing value for the same
   * attribute and variant. Validates every value against its definition first, so a batch
   * either applies fully or fails without partial writes.
   */
  async setProductSpecifications(productId: string, specs: SpecInput[]): Promise<void> {
    if (specs.length === 0) return;

    const keys = [...new Set(specs.map((spec) => spec.key))];
    const definitions = (await this.listAttributeDefinitions({
      key: keys,
    })) as unknown as DefinitionRecord[];

    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
    const missing = keys.filter((key) => !byKey.has(key));
    if (missing.length > 0) {
      throw new AttributeValueError(missing[0]!, `Unknown attribute: ${missing.join(", ")}.`);
    }

    // Validate everything before writing anything.
    const prepared = specs.map((spec) => {
      const definition = byKey.get(spec.key)!;
      if (definition.variant_scoped && !spec.variantId) {
        throw new AttributeValueError(
          spec.key,
          `${definition.name} is variant-scoped and needs a variant.`,
        );
      }
      const normalized = normalizeAttributeValue(
        spec.key,
        definition.value_type,
        spec.value,
        definition.enum_values,
      );
      return { spec, definition, normalized };
    });

    for (const { spec, definition, normalized } of prepared) {
      const existing = await this.listProductAttributeValues({
        product_id: productId,
        variant_id: spec.variantId ?? null,
        attribute_id: definition.id,
      });

      const payload = {
        product_id: productId,
        variant_id: spec.variantId ?? null,
        attribute_id: definition.id,
        display_override: spec.displayOverride ?? null,
        source: spec.source ?? null,
        ...normalized,
        // `value_enum` is a string[] in a jsonb column. Medusa's generated types describe
        // every json field as Record<string, unknown>, so the array needs an explicit cast.
        value_enum: normalized.value_enum as unknown as Record<string, unknown> | null,
      };

      if (existing.length > 0) {
        await this.updateProductAttributeValues({ id: existing[0]!.id, ...payload });
      } else {
        await this.createProductAttributeValues(payload);
      }
    }
  }

  /**
   * Returns the specs for a product, grouped and ordered for display.
   * A variant id narrows variant-scoped values to that variant (UX spec section 5).
   */
  async getRenderedSpecifications(
    productId: string,
    variantId?: string | null,
  ): Promise<RenderedSpec[]> {
    const values = (await this.listProductAttributeValues(
      { product_id: productId },
      { relations: ["attribute", "attribute.group"] },
    )) as unknown as (Record<string, unknown> & {
      variant_id: string | null;
      attribute: DefinitionRecord & {
        group?: { name: string; sort_order: number } | null;
      };
    })[];

    return values
      .filter((value) => value.variant_id === null || value.variant_id === variantId)
      .map((value) => {
        const definition = value.attribute;
        const rendered = formatAttributeValue({
          valueType: definition.value_type,
          unit: definition.unit,
          displayOverride: (value.display_override as string | null) ?? null,
          enumValues: definition.enum_values,
          value: {
            value_string: (value.value_string as string | null) ?? null,
            value_number:
              value.value_number === null || value.value_number === undefined
                ? null
                : Number(value.value_number),
            value_bool: (value.value_bool as boolean | null) ?? null,
            value_enum: (value.value_enum as string[] | null) ?? null,
          },
        });

        return rendered === null
          ? null
          : {
              key: definition.key,
              label: definition.name,
              value: rendered,
              group: definition.group?.name ?? null,
              groupOrder: definition.group?.sort_order ?? 999,
              sortOrder: 0,
              comparable: definition.comparable,
            };
      })
      .filter((spec): spec is RenderedSpec => spec !== null)
      .sort(
        (a, b) =>
          a.groupOrder - b.groupOrder ||
          (a.group ?? "").localeCompare(b.group ?? "") ||
          a.label.localeCompare(b.label),
      );
  }

  /**
   * Attributes assigned to a category, ordered for the admin form and the PLP facet list.
   * Drives ADM-005 (category loads the correct required specs) and CUST-004
   * (category-specific filters).
   */
  async getCategoryAttributes(categoryId: string) {
    const assignments = (await this.listCategoryAttributeAssignments(
      { category_id: categoryId },
      { relations: ["attribute", "attribute.group"] },
    )) as unknown as {
      required: boolean;
      filterable_override: boolean | null;
      sort_order: number;
      attribute: DefinitionRecord & { group?: { name: string; sort_order: number } | null };
    }[];

    return assignments
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((assignment) => ({
        ...assignment.attribute,
        required: assignment.required,
        // A per-category override wins over the definition's own default.
        filterable: assignment.filterable_override ?? assignment.attribute.filterable,
        group: assignment.attribute.group?.name ?? null,
        sort_order: assignment.sort_order,
      }));
  }

  /**
   * Publish validation: every attribute the category marks required must have a value
   * (08_DATA_MODEL.md section 17). Returns the missing attribute names so the admin form
   * can point at them; drafts are allowed to be incomplete (ADM-002).
   */
  async findMissingRequiredSpecifications(
    productId: string,
    categoryId: string,
  ): Promise<string[]> {
    const required = (await this.getCategoryAttributes(categoryId)).filter((a) => a.required);
    if (required.length === 0) return [];

    const values = await this.listProductAttributeValues({ product_id: productId });
    const present = new Set(values.map((value) => value.attribute_id as string));

    return required.filter((attribute) => !present.has(attribute.id)).map((a) => a.name);
  }
}

export default ElectronicsAttributesService;
