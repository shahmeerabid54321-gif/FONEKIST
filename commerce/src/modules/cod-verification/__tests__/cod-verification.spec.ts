import { codeMatches, generateCode, hashCode, maskPhone } from "../codes";
import { codVerificationRequired } from "../policy";

describe("confirmation codes", () => {
  it("generates six digits", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("does not repeat itself, which a broken generator would", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCode()));
    // 200 draws from a million values: collisions are possible but a generator stuck on a
    // handful of values fails this immediately.
    expect(codes.size).toBeGreaterThan(150);
  });

  it("stores a keyed hash, never the code", () => {
    const hash = hashCode("123456", "secret");
    expect(hash).not.toContain("123456");
    expect(hash).toHaveLength(64);
  });

  it("produces a different hash under a different key", () => {
    // Without the key, a leaked hash of a six-digit code is a lookup table away from plaintext.
    expect(hashCode("123456", "secret-a")).not.toBe(hashCode("123456", "secret-b"));
  });

  it("accepts the right code and rejects everything else", () => {
    const hash = hashCode("482913", "secret");

    expect(codeMatches("482913", hash, "secret")).toBe(true);
    expect(codeMatches("482914", hash, "secret")).toBe(false);
    expect(codeMatches("", hash, "secret")).toBe(false);
    expect(codeMatches("482913", hash, "another-secret")).toBe(false);
  });

  it("does not throw on a malformed stored hash", () => {
    // A truncated or corrupted row must fail closed, not crash the endpoint.
    expect(codeMatches("482913", "not-a-hash", "secret")).toBe(false);
    expect(codeMatches("482913", "", "secret")).toBe(false);
  });

  it.each([
    ["+923001234567", "+92 *** *** 4567"],
    ["03001234567", "030 *** *** 4567"],
    ["12345", "***"],
  ])("masks %s as %s", (phone, expected) => {
    expect(maskPhone(phone)).toBe(expected);
  });
});

describe("verification policy", () => {
  const original = process.env.COD_VERIFICATION_THRESHOLD_PKR;
  afterEach(() => {
    if (original === undefined) delete process.env.COD_VERIFICATION_THRESHOLD_PKR;
    else process.env.COD_VERIFICATION_THRESHOLD_PKR = original;
  });

  it("requires confirmation at or above the threshold", () => {
    process.env.COD_VERIFICATION_THRESHOLD_PKR = "25000";

    expect(codVerificationRequired(24999)).toBe(false);
    expect(codVerificationRequired(25000)).toBe(true);
    expect(codVerificationRequired(500000)).toBe(true);
  });

  it("fails closed when the threshold is missing or nonsense", () => {
    process.env.COD_VERIFICATION_THRESHOLD_PKR = "not-a-number";
    expect(codVerificationRequired(100)).toBe(true);

    process.env.COD_VERIFICATION_THRESHOLD_PKR = "0";
    expect(codVerificationRequired(100)).toBe(true);
  });
});
