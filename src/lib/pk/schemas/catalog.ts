/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/schemas/catalog.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

import { z } from "zod";

/**
 * Electronics attribute and warranty vocabulary shared by commerce, storefront and admin.
 * Source of truth: 08_DATA_MODEL.md sections 3-9, ADR-009.
 */

export const ATTRIBUTE_VALUE_TYPES = [
  "string",
  "int",
  "decimal",
  "bool",
  "enum",
  "multi_enum",
] as const;
export type AttributeValueType = (typeof ATTRIBUTE_VALUE_TYPES)[number];

export const attributeDefinitionSchema = z.object({
  id: z.string(),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "Use snake_case, e.g. ram_gb."),
  name: z.string().min(1),
  value_type: z.enum(ATTRIBUTE_VALUE_TYPES),
  unit: z.string().nullable(),
  enum_values: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
  filterable: z.boolean(),
  comparable: z.boolean(),
  searchable: z.boolean(),
  /** True when the value differs per variant (e.g. storage) rather than per product. */
  variant_scoped: z.boolean(),
});
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;

export const attributeGroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  sort_order: z.number().int(),
});

/** Typed attribute value plus the normalised form used for filtering and comparison. */
export const attributeValueSchema = z.object({
  attribute_key: z.string(),
  value_string: z.string().nullable(),
  value_number: z.number().nullable(),
  value_bool: z.boolean().nullable(),
  value_enum: z.array(z.string()).default([]),
  /** Optional presentation override; formatting never lives in the stored value. */
  display_override: z.string().nullable(),
});
export type AttributeValue = z.infer<typeof attributeValueSchema>;

export const WARRANTY_TYPES = ["manufacturer", "distributor", "shop", "none"] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];

export const DURATION_UNITS = ["day", "month", "year"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

export const warrantyPolicySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.enum(WARRANTY_TYPES),
  provider_name: z.string().nullable(),
  duration_value: z.number().int().nonnegative(),
  duration_unit: z.enum(DURATION_UNITS),
  coverage_summary: z.string(),
  claim_instructions: z.string(),
  terms_reference: z.string().nullable(),
  customer_pays_shipping: z.boolean().nullable(),
  active: z.boolean(),
});
export type WarrantyPolicy = z.infer<typeof warrantyPolicySchema>;

/**
 * Purchase-time warranty snapshot (WAR-001). Written onto the order line at completion and
 * never updated afterwards, so catalog edits cannot rewrite a historical promise.
 */
export const warrantySnapshotSchema = z.object({
  type: z.enum(WARRANTY_TYPES),
  provider_name: z.string().nullable(),
  duration_value: z.number().int().nonnegative(),
  duration_unit: z.enum(DURATION_UNITS),
  coverage_summary: z.string(),
  claim_instructions: z.string(),
  terms_reference: z.string().nullable(),
  /** Version of the policy text in force at purchase time. */
  terms_version: z.string(),
  snapshotted_at: z.string().datetime(),
});
export type WarrantySnapshot = z.infer<typeof warrantySnapshotSchema>;

/** Short factual label, e.g. "1-year manufacturer warranty" (UX spec section 13). */
export function warrantyLabel(
  policy: Pick<WarrantyPolicy, "type" | "duration_value" | "duration_unit" | "provider_name">,
): string {
  if (policy.type === "none" || policy.duration_value === 0) return "No warranty";

  const source =
    policy.type === "shop" ? "shop" : policy.type === "distributor" ? "distributor" : "manufacturer";

  // The unit stays singular: this is a hyphenated compound adjective ("a 2-year warranty"),
  // not a count, so "2-years manufacturer warranty" is wrong.
  return `${policy.duration_value}-${policy.duration_unit} ${source} warranty`;
}

export const PRODUCT_CONDITIONS = ["new", "open_box", "refurbished", "used"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const COMPATIBILITY_RELATIONS = [
  "compatible",
  "requires_adapter",
  "incompatible",
] as const;
export type CompatibilityRelation = (typeof COMPATIBILITY_RELATIONS)[number];
