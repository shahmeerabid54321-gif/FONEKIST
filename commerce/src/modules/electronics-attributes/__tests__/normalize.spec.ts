import {
  AttributeValueError,
  formatAttributeValue,
  normalizeAttributeValue,
} from "../normalize";

/**
 * Attribute normalisation tests.
 *
 * ADR-009 and PRD section 2: wrong or incomplete specs are a first-class product problem.
 * These tests pin the rule that a bad value fails loudly at entry rather than being
 * silently coerced into something plausible.
 */

describe("normalizeAttributeValue", () => {
  it("stores an integer in the numeric column and mirrors it as text", () => {
    expect(normalizeAttributeValue("ram_gb", "int", 16)).toEqual({
      value_string: "16",
      value_number: 16,
      value_bool: null,
      value_enum: null,
    });
  });

  it("accepts a numeric string with thousands separators", () => {
    expect(normalizeAttributeValue("battery_mah", "int", "5,000").value_number).toBe(5000);
  });

  it("rejects a non-numeric value for a numeric attribute", () => {
    // "sixteen" must never end up as a silent null or a zero.
    expect(() => normalizeAttributeValue("ram_gb", "int", "sixteen")).toThrow(AttributeValueError);
  });

  it("rejects a decimal for an integer attribute", () => {
    expect(() => normalizeAttributeValue("ram_gb", "int", 16.5)).toThrow(/whole number/);
  });

  it("accepts a decimal for a decimal attribute", () => {
    expect(normalizeAttributeValue("screen_size_in", "decimal", 15.3).value_number).toBe(15.3);
  });

  it.each([true, "true", "Yes", "1", "y"])("parses %s as true", (truthy) => {
    expect(normalizeAttributeValue("anc", "bool", truthy).value_bool).toBe(true);
  });

  it.each([false, "false", "No", "0", "n"])("parses %s as false", (falsy) => {
    expect(normalizeAttributeValue("anc", "bool", falsy).value_bool).toBe(false);
  });

  it("rejects an ambiguous boolean rather than guessing", () => {
    expect(() => normalizeAttributeValue("anc", "bool", "maybe")).toThrow(/yes\/no/);
  });

  it("rejects an enum value outside the controlled list", () => {
    const allowed = [
      { value: "approved", label: "PTA Approved" },
      { value: "not_approved", label: "Not PTA Approved" },
    ];
    expect(() => normalizeAttributeValue("pta_status", "enum", "maybe_approved", allowed)).toThrow(
      /not an allowed value/,
    );
  });

  it("rejects multiple values for a single-value enum", () => {
    const allowed = [
      { value: "oled", label: "OLED" },
      { value: "ips_lcd", label: "IPS LCD" },
    ];
    expect(() =>
      normalizeAttributeValue("panel_type", "enum", ["oled", "ips_lcd"], allowed),
    ).toThrow(/Only one value/);
  });

  it("accepts several values for a multi-enum", () => {
    const allowed = [
      { value: "5g", label: "5G" },
      { value: "nfc", label: "NFC" },
    ];
    const result = normalizeAttributeValue("connectivity", "multi_enum", ["5g", "nfc"], allowed);
    expect(result.value_enum).toEqual(["5g", "nfc"]);
  });

  it.each([null, undefined, ""])(
    "treats %p as absent rather than as a zero or false",
    (empty) => {
      const result = normalizeAttributeValue("ram_gb", "int", empty);
      expect(result.value_number).toBeNull();
      expect(result.value_bool).toBeNull();
    },
  );
});

describe("formatAttributeValue", () => {
  const numeric = (n: number) => ({
    value_string: String(n),
    value_number: n,
    value_bool: null,
    value_enum: null,
  });

  it("groups thousands for a measured quantity", () => {
    expect(
      formatAttributeValue({ valueType: "int", unit: "mAh", value: numeric(5000) }),
    ).toBe("5,000 mAh");
  });

  it("does not group a unitless integer such as a year", () => {
    // "2,025" is not a year. Grouping applies to quantities, which carry units.
    expect(formatAttributeValue({ valueType: "int", unit: null, value: numeric(2025) })).toBe("2025");
  });

  it("renders booleans as words, not as true/false", () => {
    const value = { value_string: null, value_number: null, value_bool: true, value_enum: null };
    expect(formatAttributeValue({ valueType: "bool", value })).toBe("Yes");
  });

  it("uses enum labels rather than raw machine values", () => {
    const value = { value_string: null, value_number: null, value_bool: null, value_enum: ["approved"] };
    expect(
      formatAttributeValue({
        valueType: "enum",
        value,
        enumValues: [{ value: "approved", label: "PTA Approved" }],
      }),
    ).toBe("PTA Approved");
  });

  it("prefers an explicit display override", () => {
    expect(
      formatAttributeValue({
        valueType: "int",
        unit: "GB",
        displayOverride: "16 GB (2x8 GB)",
        value: numeric(16),
      }),
    ).toBe("16 GB (2x8 GB)");
  });

  it("returns null for an absent value so callers can omit the row", () => {
    expect(
      formatAttributeValue({
        valueType: "int",
        value: { value_string: null, value_number: null, value_bool: null, value_enum: null },
      }),
    ).toBeNull();
  });
});
