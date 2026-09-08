import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), basket: vi.fn(), enabled: { installments: true } }));
vi.mock("@/lib/medusa", () => ({ medusaFetch: mocks.fetch }));
vi.mock("@/lib/reservation", () => ({ getBasket: mocks.basket, getOrCreateBasket: vi.fn(), addLineItem: vi.fn() }));
vi.mock("@/lib/features", () => ({ features: mocks.enabled }));
import { submitApplicationAction } from "./installments";

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ variant_id: "variant-test", plan_id: "plan-test", idempotency_key: "a".repeat(32), document_ids: "doc1,doc2,doc3,doc4", consent: "on", applicant_cnic: "0000000000000" })) data.set(key, value);
  return data;
}
describe("application submission retries", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.enabled.installments = true;
    mocks.basket.mockResolvedValue({ id: "cart-test", items: [{ variant_id: "variant-test", quantity: 1 }] });
    mocks.fetch.mockResolvedValue({ data: { reference: "FK-TEST", state: "submitted", reserved_until: "2026-09-10T00:00:00Z" } });
  });
  it("uses the same key for a retry and returns no submitted identity data", async () => {
    const first = await submitApplicationAction(null, form());
    await submitApplicationAction(null, form());
    expect(mocks.fetch.mock.calls.map((call) => call[1].headers["Idempotency-Key"] ?? call[1].headers["idempotency-key"])).toEqual(["a".repeat(32), "a".repeat(32)]);
    expect(first.ok).toBe(true);
    expect(JSON.stringify(first)).not.toContain("0000000000000");
  });
  it("rejects missing retry identity before touching commerce", async () => {
    const data = form(); data.delete("idempotency_key");
    expect((await submitApplicationAction(null, data)).code).toBe("VALIDATION_ERROR");
    expect(mocks.basket).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("enforces the intake feature gate on the server action", async () => {
    mocks.enabled.installments = false;
    expect((await submitApplicationAction(null, form())).code).toBe("FORBIDDEN");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
