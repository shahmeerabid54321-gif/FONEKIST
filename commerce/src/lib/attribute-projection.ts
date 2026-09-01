/**
 * Projects typed attribute values onto the string form used for filtering.
 *
 * 08_DATA_MODEL.md section 5 keeps the normalised *filter* value separate from display
 * formatting. Both the listing filter map and the search index need that filter value, and
 * they must agree exactly — a facet that offers "16" while the index stores "16 GB" filters
 * to nothing. This is the one place that projection is defined.
 */

export interface TypedAttributeValue {
  product_id: string;
  value_string: string | null;
  value_number: number | string | null;
  value_bool: boolean | null;
  value_enum: string[] | null;
  attribute: { key: string };
}

/** Every type projected to strings, so filter comparison has exactly one code path. */
export function filterValuesOf(value: TypedAttributeValue): string[] {
  if (value.value_enum) return value.value_enum;
  if (value.value_bool !== null && value.value_bool !== undefined) return [String(value.value_bool)];
  if (value.value_number !== null && value.value_number !== undefined) {
    // Number() strips a stored decimal's trailing zeros so "16.0" and "16" are one value.
    return [String(Number(value.value_number))];
  }
  return value.value_string ? [value.value_string] : [];
}

/** Groups values into `{ [productId]: { [attributeKey]: string[] } }`. */
export function projectAttributeValues(
  values: TypedAttributeValue[],
): Record<string, Record<string, string[]>> {
  const products: Record<string, Record<string, string[]>> = {};

  for (const value of values) {
    const entry = (products[value.product_id] ??= {});
    const key = value.attribute.key;
    entry[key] = [...new Set([...(entry[key] ?? []), ...filterValuesOf(value)])];
  }

  return products;
}
