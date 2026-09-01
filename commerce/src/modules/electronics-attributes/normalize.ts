/**
 * Typed attribute value normalisation.
 *
 * Data model principle 5: normalised filter values are stored separately from display
 * formatting. This module is the single place that decides which column a raw value lands
 * in, so filtering, comparison and the search document all agree.
 */

export type AttributeValueType = "string" | "int" | "decimal" | "bool" | "enum" | "multi_enum";

export interface NormalizedValue {
  value_string: string | null;
  value_number: number | null;
  value_bool: boolean | null;
  value_enum: string[] | null;
}

export class AttributeValueError extends Error {
  constructor(
    readonly attributeKey: string,
    message: string,
  ) {
    super(message);
    this.name = "AttributeValueError";
  }
}

const EMPTY: NormalizedValue = {
  value_string: null,
  value_number: null,
  value_bool: null,
  value_enum: null,
};

const TRUTHY = new Set(["true", "yes", "1", "y"]);
const FALSY = new Set(["false", "no", "0", "n"]);

/**
 * Converts a raw admin/import value into its typed columns.
 *
 * Throws rather than silently coercing: a laptop listed with `ram_gb: "sixteen"` must fail
 * publish validation loudly, because a wrong spec is one of the first-class product
 * problems this platform exists to solve (01_PRD.md section 2).
 */
export function normalizeAttributeValue(
  key: string,
  valueType: AttributeValueType,
  raw: unknown,
  enumValues?: { value: string; label: string }[] | null,
): NormalizedValue {
  if (raw === null || raw === undefined || raw === "") return { ...EMPTY };

  switch (valueType) {
    case "string": {
      const text = String(raw).trim();
      return { ...EMPTY, value_string: text === "" ? null : text };
    }

    case "int":
    case "decimal": {
      const num = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/,/g, ""));
      if (!Number.isFinite(num)) {
        throw new AttributeValueError(key, `"${String(raw)}" is not a valid number.`);
      }
      if (valueType === "int" && !Number.isInteger(num)) {
        throw new AttributeValueError(key, `"${String(raw)}" must be a whole number.`);
      }
      // Numbers are also mirrored into value_string so exact-match search on a spec works.
      return { ...EMPTY, value_number: num, value_string: String(num) };
    }

    case "bool": {
      if (typeof raw === "boolean") return { ...EMPTY, value_bool: raw };
      const text = String(raw).trim().toLowerCase();
      if (TRUTHY.has(text)) return { ...EMPTY, value_bool: true };
      if (FALSY.has(text)) return { ...EMPTY, value_bool: false };
      throw new AttributeValueError(key, `"${String(raw)}" is not a valid yes/no value.`);
    }

    case "enum":
    case "multi_enum": {
      const allowed = new Set((enumValues ?? []).map((entry) => entry.value));
      const rawList = Array.isArray(raw) ? raw : String(raw).split(",");
      const selected = rawList.map((entry) => String(entry).trim()).filter(Boolean);

      if (selected.length === 0) return { ...EMPTY };
      if (valueType === "enum" && selected.length > 1) {
        throw new AttributeValueError(key, `Only one value is allowed, received ${selected.length}.`);
      }

      const invalid = selected.filter((entry) => !allowed.has(entry));
      if (allowed.size > 0 && invalid.length > 0) {
        throw new AttributeValueError(
          key,
          `${invalid.join(", ")} is not an allowed value. Allowed: ${[...allowed].join(", ")}.`,
        );
      }

      return {
        ...EMPTY,
        value_enum: selected,
        // Single enums also populate value_string so equality filters share one code path.
        value_string: valueType === "enum" ? (selected[0] ?? null) : selected.join(","),
      };
    }
  }
}

/** Renders a stored value for display, honouring an explicit override and the unit. */
export function formatAttributeValue(input: {
  valueType: AttributeValueType;
  unit?: string | null;
  displayOverride?: string | null;
  value: NormalizedValue;
  enumValues?: { value: string; label: string }[] | null;
}): string | null {
  if (input.displayOverride) return input.displayOverride;

  const { value } = input;
  const withUnit = (text: string) => (input.unit ? `${text} ${input.unit}` : text);

  switch (input.valueType) {
    case "bool":
      if (value.value_bool === null) return null;
      return value.value_bool ? "Yes" : "No";

    case "int":
    case "decimal": {
      if (value.value_number === null) return null;
      // Thousands grouping applies to measured quantities, which always carry a unit.
      // Unitless integers are identifier-like (a release year, a port count) and must not
      // be grouped — "2,025" is not a year.
      const formatted = input.unit
        ? value.value_number.toLocaleString("en-PK")
        : String(value.value_number);
      return withUnit(formatted);
    }

    case "enum":
    case "multi_enum": {
      const selected = value.value_enum ?? [];
      if (selected.length === 0) return null;
      const labels = new Map((input.enumValues ?? []).map((e) => [e.value, e.label]));
      return selected.map((entry) => labels.get(entry) ?? entry).join(", ");
    }

    case "string":
      return value.value_string ? withUnit(value.value_string) : null;
  }
}
