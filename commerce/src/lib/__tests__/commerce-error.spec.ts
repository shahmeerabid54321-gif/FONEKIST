import { AppError } from "@pk/contracts";
import { commerceError, isGuestCustomerRace } from "../commerce-error";

describe("commerce error boundary", () => {
  it("preserves stock conflicts instead of returning an internal server error", () => {
    const result = commerceError({ type: "not_allowed", message: "Not enough stock available for item secret-id at location secret-location" });
    expect(result.code).toBe("OUT_OF_STOCK");
    expect(result.status).toBe(409);
    expect(JSON.stringify(result.toResponseError())).not.toContain("secret");
  });
  it("preserves explicit application validation through idempotency", () => {
    expect(commerceError({ responseError: { code: "CONFLICT", message: "That plan is no longer available." } }).code).toBe("CONFLICT");
  });
  it("keeps indeterminate outcomes indeterminate", () => {
    const error = new AppError("PROVIDER_UNAVAILABLE");
    expect(commerceError(error)).toBe(error);
    expect(commerceError(error).isIndeterminate).toBe(true);
  });
  it("does not expose unknown database errors", () => {
    const result = commerceError(new Error("database password=private"));
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.toResponseError())).not.toContain("private");
  });
  it("only retries the specific guest-customer uniqueness race", () => {
    expect(isGuestCustomerRace({ type: "duplicate_error", message: "Customer with email: test@example.invalid, has_account: false, already exists." })).toBe(true);
    expect(isGuestCustomerRace({ type: "invalid_data", message: "Customer with email: test@example.invalid, has_account: false, already exists." })).toBe(true);
    expect(isGuestCustomerRace({ type: "duplicate_error", message: "Order already exists" })).toBe(false);
    expect(isGuestCustomerRace(new Error("Connection lost"))).toBe(false);
  });
});
