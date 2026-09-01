import { describe, expect, it } from "vitest";
import { addressSchema, formatPkMobile, formatPkr, pkMobileSchema } from "./pakistan.js";

describe("Pakistani mobile numbers", () => {
  it("accepts the formats customers actually type", () => {
    const expected = "+923001234567";
    for (const input of [
      "03001234567",
      "0300 1234567",
      "0300-1234567",
      "+923001234567",
      "+92 300 1234567",
      "00923001234567",
      "923001234567",
      "3001234567",
    ]) {
      expect(pkMobileSchema.parse(input), `failed for ${input}`).toBe(expected);
    }
  });

  it("rejects numbers that are not Pakistani mobiles", () => {
    for (const input of [
      "0211234567", // Karachi landline, not a mobile
      "0300123456", // too short
      "030012345678", // too long
      "+14155551234", // wrong country
      "not a number",
      "",
    ]) {
      expect(pkMobileSchema.safeParse(input).success, `accepted ${input}`).toBe(false);
    }
  });

  it("formats an E.164 number back into local display form", () => {
    expect(formatPkMobile("+923001234567")).toBe("0300 1234567");
  });

  it("leaves an unexpected value alone rather than mangling it", () => {
    expect(formatPkMobile("+9230012")).toBe("+9230012");
  });
});

describe("address schema", () => {
  const valid = {
    full_name: "Ali Raza",
    phone: "03001234567",
    province: "Sindh",
    city: "Karachi",
    area: "North Nazimabad",
    street: "House 12, Street 4",
  };

  it("accepts a Pakistani address with no postal code", () => {
    // UX spec section 8: do not force a US-style ZIP.
    const result = addressSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+923001234567");
  });

  it("keeps landmark and instructions optional", () => {
    expect(addressSchema.safeParse({ ...valid, landmark: "Near Hyderi Market" }).success).toBe(true);
  });

  it("requires the fields operations actually need", () => {
    for (const field of ["full_name", "province", "city", "area", "street"] as const) {
      const { [field]: _omitted, ...rest } = valid;
      expect(addressSchema.safeParse(rest).success, `${field} was not required`).toBe(false);
    }
  });

  it("rejects a province outside Pakistan", () => {
    expect(addressSchema.safeParse({ ...valid, province: "California" }).success).toBe(false);
  });
});

describe("PKR formatting", () => {
  it("renders whole rupees with grouping and no decimals", () => {
    expect(formatPkr(154999)).toBe("Rs 154,999");
    expect(formatPkr(0)).toBe("Rs 0");
    expect(formatPkr(1000000)).toBe("Rs 1,000,000");
  });
});
