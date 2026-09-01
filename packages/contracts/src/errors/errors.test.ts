import { describe, expect, it } from "vitest";
import { AppError, ERROR_CODES, ERROR_STATUS, INDETERMINATE_CODES } from "./index.js";

describe("AppError", () => {
  it("never leaks internal detail into the customer-facing response", () => {
    const error = new AppError("INTERNAL_ERROR", {
      internal: { dbUrl: "postgres://user:password@host/db", stack: "secret trace" },
    });

    const response = error.toResponseError();
    const serialised = JSON.stringify(response);

    expect(serialised).not.toContain("password");
    expect(serialised).not.toContain("secret trace");
    expect(response).toEqual({
      code: "INTERNAL_ERROR",
      message: expect.any(String),
      field_errors: {},
    });
  });

  it("marks timeouts and provider outages as indeterminate, not failed", () => {
    // API contract section 13: a timeout means unknown. Retrying a payment write blindly
    // after one is how a customer gets charged twice.
    expect(new AppError("PAYMENT_PENDING").isIndeterminate).toBe(true);
    expect(new AppError("PROVIDER_UNAVAILABLE").isIndeterminate).toBe(true);
    expect(new AppError("PAYMENT_FAILED").isIndeterminate).toBe(false);
    expect(new AppError("VALIDATION_ERROR").isIndeterminate).toBe(false);
  });

  it("does not treat a pending payment as an HTTP failure", () => {
    expect(ERROR_STATUS.PAYMENT_PENDING).toBe(202);
  });

  it("wraps an unknown throwable without losing the cause", () => {
    const original = new Error("boom");
    const wrapped = AppError.from(original);

    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.internal).toBe(original);
    expect(wrapped.toResponseError().message).not.toContain("boom");
  });

  it("returns an existing AppError unchanged", () => {
    const original = new AppError("OUT_OF_STOCK");
    expect(AppError.from(original)).toBe(original);
  });

  it("gives every code a status and a customer-safe message", () => {
    for (const code of ERROR_CODES) {
      const error = new AppError(code);
      expect(ERROR_STATUS[code], code).toBeGreaterThan(0);
      expect(error.message.length, code).toBeGreaterThan(10);
      // No jargon should reach the customer.
      expect(error.message, code).not.toMatch(/undefined|null|Error:|stack/i);
    }
  });

  it("keeps the indeterminate set minimal and deliberate", () => {
    expect([...INDETERMINATE_CODES].sort()).toEqual(["PAYMENT_PENDING", "PROVIDER_UNAVAILABLE"]);
  });
});
