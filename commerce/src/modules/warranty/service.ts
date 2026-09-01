import { MedusaService } from "@medusajs/framework/utils";
import { warrantyLabel } from "@pk/contracts";
import {
  OrderLineWarrantySnapshot,
  ProductWarrantyAssignment,
  WarrantyPolicy,
} from "./models";

type PolicyRecord = {
  id: string;
  name: string;
  type: "manufacturer" | "distributor" | "shop" | "none";
  provider_name: string | null;
  duration_value: number;
  duration_unit: "day" | "month" | "year";
  coverage_summary: string;
  claim_instructions: string;
  terms_reference: string | null;
  terms_version: string;
  customer_pays_shipping: boolean | null;
  active: boolean;
};

export class WarrantySnapshotImmutableError extends Error {
  constructor(orderLineId: string) {
    super(
      `Warranty snapshot for order line ${orderLineId} already exists and cannot be changed (WAR-001).`,
    );
    this.name = "WarrantySnapshotImmutableError";
  }
}

/**
 * Warranty service.
 *
 * Two responsibilities that must not be confused: resolving the *current* catalog warranty
 * for display, and writing the *historical* snapshot at purchase time. Only the former
 * reflects catalog edits.
 */
class WarrantyService extends MedusaService({
  WarrantyPolicy,
  ProductWarrantyAssignment,
  OrderLineWarrantySnapshot,
}) {
  /**
   * Current catalog warranty for a product/variant. A variant-specific assignment wins over
   * the product-level one. Returns null when nothing is assigned — which publish validation
   * treats as a blocking error, since CUST-008 requires an explicit policy or `none`.
   */
  async resolvePolicy(productId: string, variantId?: string | null): Promise<PolicyRecord | null> {
    const assignments = (await this.listProductWarrantyAssignments(
      { product_id: productId },
      { relations: ["policy"] },
    )) as unknown as { variant_id: string | null; policy: PolicyRecord }[];

    if (assignments.length === 0) return null;

    const variantSpecific = variantId
      ? assignments.find((assignment) => assignment.variant_id === variantId)
      : undefined;
    const productLevel = assignments.find((assignment) => assignment.variant_id === null);

    return (variantSpecific ?? productLevel)?.policy ?? null;
  }

  /** Short factual label for cards and the PDP, e.g. "1-year manufacturer warranty". */
  async resolveLabel(productId: string, variantId?: string | null): Promise<string> {
    const policy = await this.resolvePolicy(productId, variantId);
    return policy ? warrantyLabel(policy) : "No warranty";
  }

  /**
   * Writes the purchase-time snapshot for one order line (WAR-001).
   *
   * Idempotent by order line: calling it again returns the existing snapshot untouched, so
   * a retried order-completion workflow cannot rewrite history. Passing different values
   * for a line that already has a snapshot is an error, not a silent update.
   */
  async snapshotOrderLine(input: {
    orderId: string;
    orderLineId: string;
    productId: string;
    variantId?: string | null;
  }) {
    const existing = await this.listOrderLineWarrantySnapshots({
      order_line_id: input.orderLineId,
    });
    if (existing.length > 0) return existing[0];

    const policy = await this.resolvePolicy(input.productId, input.variantId);

    // A missing policy at purchase time is recorded as an explicit "none" rather than left
    // blank, so the order line always states what was promised.
    const snapshot = policy
      ? {
          type: policy.type,
          provider_name: policy.provider_name,
          duration_value: policy.duration_value,
          duration_unit: policy.duration_unit,
          coverage_summary: policy.coverage_summary,
          claim_instructions: policy.claim_instructions,
          terms_reference: policy.terms_reference,
          terms_version: policy.terms_version,
          label: warrantyLabel(policy),
          source_policy_id: policy.id,
        }
      : {
          type: "none" as const,
          provider_name: null,
          duration_value: 0,
          duration_unit: "year" as const,
          coverage_summary: "No warranty was offered with this item.",
          claim_instructions: "Not applicable.",
          terms_reference: null,
          terms_version: "n/a",
          label: "No warranty",
          source_policy_id: null,
        };

    return await this.createOrderLineWarrantySnapshots({
      order_id: input.orderId,
      order_line_id: input.orderLineId,
      ...snapshot,
    });
  }

  /**
   * Guard against accidental mutation. The generated `updateOrderLineWarrantySnapshots` is
   * intentionally overridden to throw: nothing in the application may edit a snapshot
   * (WAR-001). Declared as a property because MedusaService generates the base member as
   * one, and a method would not override it.
   */
  override updateOrderLineWarrantySnapshots = async (data: unknown): Promise<never> => {
    const id =
      typeof data === "object" && data !== null && "order_line_id" in data
        ? String((data as { order_line_id: unknown }).order_line_id)
        : "unknown";
    throw new WarrantySnapshotImmutableError(id);
  };

  /** Snapshots for an order, for the confirmation page, tracking view and returns flow. */
  async getOrderSnapshots(orderId: string) {
    return await this.listOrderLineWarrantySnapshots({ order_id: orderId });
  }
}

export default WarrantyService;
