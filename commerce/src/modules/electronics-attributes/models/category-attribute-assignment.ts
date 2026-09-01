import { model } from "@medusajs/framework/utils";
import { AttributeDefinition } from "./attribute-definition";

/**
 * Binds an attribute to a product category, with per-category overrides.
 * Source of truth: 08_DATA_MODEL.md section 5, ADM-005.
 *
 * `category_id` references a Medusa product category. It is a plain id rather than a
 * module relation because the categories live in the Product module; the two are joined
 * through a module link (see src/links/) rather than a foreign key across module boundaries.
 */
export const CategoryAttributeAssignment = model
  .define("category_attribute_assignment", {
    id: model.id({ prefix: "catattr" }).primaryKey(),
    category_id: model.text(),
    attribute: model.belongsTo(() => AttributeDefinition, { mappedBy: "assignments" }),
    /** Publish validation fails when a required attribute has no value (data model section 17). */
    required: model.boolean().default(false),
    /** Overrides the definition's own `filterable` for this category only. */
    filterable_override: model.boolean().nullable(),
    sort_order: model.number().default(0),
  })
  .indexes([
    { on: ["category_id"] },
    // One assignment per attribute per category.
    { on: ["category_id", "attribute_id"], unique: true },
  ]);
