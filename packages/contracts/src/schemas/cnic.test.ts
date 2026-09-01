import { describe, expect, it } from "vitest";
import { cnicSchema, formatCnic, maskCnic } from "./pakistan.js";

describe("cnicSchema", () => {
  it("accepts the dashed form customers actually type", () => {
    expect(cnicSchema.parse("42101-1234567-1")).toBe("4210112345671");
  });

  it("accepts bare digits and spaces", () => {
    expect(cnicSchema.parse("4210112345671")).toBe("4210112345671");
    expect(cnicSchema.parse(" 42101 1234567 1 ")).toBe("4210112345671");
  });

  it("rejects anything that is not thirteen digits", () => {
    expect(cnicSchema.safeParse("42101-123456-1").success).toBe(false);
    expect(cnicSchema.safeParse("abcdefghijklm").success).toBe(false);
    expect(cnicSchema.safeParse("").success).toBe(false);
  });
});

describe("maskCnic", () => {
  it("keeps only enough to tell two applications apart", () => {
    const masked = maskCnic("4210112345671");
    expect(masked).toBe("*****-****567-1");
    // The masked form is the only one allowed outside the reviewer detail view (ADR-024),
    // so it must not leak the leading digits, which identify the district of issue.
    expect(masked).not.toContain("42101");
    expect(masked).not.toContain("1234567");
  });

  it("never returns raw input when the value is malformed", () => {
    expect(maskCnic("nonsense")).toBe("*************");
  });
});

describe("formatCnic", () => {
  it("renders the conventional grouping", () => {
    expect(formatCnic("4210112345671")).toBe("42101-1234567-1");
  });
});
