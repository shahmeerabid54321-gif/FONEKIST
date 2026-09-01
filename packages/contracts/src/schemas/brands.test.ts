import { describe, expect, it } from "vitest";
import { brandDisplayName, brandHandle, slugifyBrand } from "./brands.js";

describe("brandHandle", () => {
  it("folds Xiaomi sub-brands onto one handle", () => {
    // The reason this exists: without it, a brand page for Xiaomi shows a fraction of the
    // Xiaomi catalogue and three near-empty pages sit beside it.
    expect(brandHandle("Xiaomi")).toBe("xiaomi");
    expect(brandHandle("MI")).toBe("xiaomi");
    expect(brandHandle("Redmi")).toBe("xiaomi");
    expect(brandHandle("POCO")).toBe("xiaomi");
    expect(brandHandle("poco")).toBe("xiaomi");
  });

  it("does not fold brands that only share an owner", () => {
    // Tecno and Infinix are both Transsion. A customer shopping for one does not consider
    // the other a substitute, so merging them would be a merchandising opinion dressed up
    // as a data fix.
    expect(brandHandle("Tecno")).toBe("tecno");
    expect(brandHandle("Infinix")).toBe("infinix");
  });

  it("normalises case, spacing and punctuation", () => {
    expect(brandHandle("  OnePlus ")).toBe("oneplus");
    expect(brandHandle("One Plus")).toBe("oneplus");
    expect(brandHandle("Samsung Galaxy")).toBe("samsung");
  });

  it("returns null rather than an empty string when there is no brand", () => {
    expect(brandHandle(null)).toBeNull();
    expect(brandHandle("")).toBeNull();
    expect(brandHandle("   ")).toBeNull();
    // An empty handle would match nothing and sort first, silently.
    expect(brandHandle("!!!")).toBeNull();
  });

  it("slugifies accented names to ASCII", () => {
    expect(slugifyBrand("Télé")).toBe("tele");
  });
});

describe("brandDisplayName", () => {
  it("uses the brand's own capitalisation where we know it", () => {
    expect(brandDisplayName("oneplus")).toBe("OnePlus");
    expect(brandDisplayName("realme")).toBe("realme");
    expect(brandDisplayName("oppo")).toBe("OPPO");
  });

  it("title-cases an unknown handle rather than failing", () => {
    expect(brandDisplayName("some-new-brand")).toBe("Some New Brand");
  });
});
