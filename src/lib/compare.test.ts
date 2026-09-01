import { describe, expect, it } from "vitest";
import {
  buildCompareHref,
  differencesOnly,
  MAX_COMPARE,
  parseCompareHandles,
  type CompareRow,
} from "./compare";

describe("parseCompareHandles", () => {
  it("reads a comma-separated list", () => {
    expect(parseCompareHandles("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("reads a repeated parameter", () => {
    expect(parseCompareHandles(["a", "b"])).toEqual(["a", "b"]);
  });

  it("caps the selection at three", () => {
    // Four columns of specifications do not fit a phone screen without hiding one behind a
    // scroll or shrinking the type past readable.
    expect(parseCompareHandles("a,b,c,d,e")).toHaveLength(MAX_COMPARE);
    expect(parseCompareHandles("a,b,c,d,e")).toEqual(["a", "b", "c"]);
  });

  it("de-duplicates so one phone cannot fill the table", () => {
    expect(parseCompareHandles("a,a,a,b")).toEqual(["a", "b"]);
  });

  it("normalises case and whitespace", () => {
    expect(parseCompareHandles(" A , b ")).toEqual(["a", "b"]);
  });

  it("returns nothing for an absent or empty parameter", () => {
    expect(parseCompareHandles(undefined)).toEqual([]);
    expect(parseCompareHandles("")).toEqual([]);
    expect(parseCompareHandles(",,,")).toEqual([]);
  });
});

describe("buildCompareHref", () => {
  it("builds a shareable URL", () => {
    expect(buildCompareHref(["a", "b"])).toBe("/compare?ids=a,b");
  });

  it("caps and de-duplicates the same way the parser does", () => {
    // The two must agree, or a link this function builds could parse back differently.
    expect(buildCompareHref(["a", "a", "b", "c", "d"])).toBe("/compare?ids=a,b,c");
  });

  it("returns the bare page when there is nothing selected", () => {
    expect(buildCompareHref([])).toBe("/compare");
  });
});

describe("differencesOnly", () => {
  const rows: CompareRow[] = [
    { key: "ram", label: "Memory", group: null, values: ["8 GB", "8 GB"], differs: false },
    { key: "battery", label: "Battery", group: null, values: ["5000 mAh", "4000 mAh"], differs: true },
    { key: "nfc", label: "NFC", group: null, values: ["Yes", null], differs: true },
  ];

  it("keeps only the rows that differ", () => {
    expect(differencesOnly(rows).map((row) => row.key)).toEqual(["battery", "nfc"]);
  });

  it("treats a value one phone lacks as a difference", () => {
    // A spec one handset has and another does not is exactly what somebody comparing is
    // looking for, so it must survive the differences-only filter.
    const missing = differencesOnly(rows).find((row) => row.key === "nfc");
    expect(missing).toBeDefined();
  });
});
