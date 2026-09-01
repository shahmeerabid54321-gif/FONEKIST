import { MedusaService } from "@medusajs/framework/utils";
import { ReturnItem, ReturnRequest } from "./models";

/**
 * Return requests.
 *
 * Storage and the state rules around a request. Eligibility lives in `eligibility.ts`
 * because it depends on the order, which this module deliberately does not read (ADR-005).
 */

export interface CreateRequestInput {
  orderId: string;
  orderReference: string;
  customerId?: string | null;
  reasonCode: string;
  requestedResolution: "refund" | "replacement" | "repair";
  notes?: string | null;
  items: { orderLineId: string; title: string; quantity: number }[];
}

interface RequestRow {
  id: string;
  order_id: string;
  status: string;
}

/** A request in one of these states still holds the quantity it covers. */
const OPEN_STATUSES = ["requested", "approved", "received"];

class ReturnsService extends MedusaService({ ReturnRequest, ReturnItem }) {
  async createRequest(input: CreateRequestInput): Promise<{ id: string }> {
    const created = (await this.createReturnRequests({
      order_id: input.orderId,
      order_reference: input.orderReference,
      customer_id: input.customerId ?? null,
      status: "requested",
      reason_code: input.reasonCode,
      requested_resolution: input.requestedResolution,
      notes: input.notes ?? null,
    })) as unknown as RequestRow;

    await this.createReturnItems(
      input.items.map((item) => ({
        request_id: created.id,
        order_line_id: item.orderLineId,
        title: item.title,
        quantity: item.quantity,
      })),
    );

    return { id: created.id };
  }

  /**
   * Quantities already spoken for by open requests on an order.
   *
   * This is what stops the same unit being returned twice: a second request is measured
   * against what the first one already covers, not against the order alone.
   */
  async requestedQuantities(orderId: string): Promise<Record<string, number>> {
    const requests = (await this.listReturnRequests(
      { order_id: orderId, status: OPEN_STATUSES },
      { relations: ["items"] },
    )) as unknown as { items: { order_line_id: string; quantity: number }[] }[];

    const totals: Record<string, number> = {};
    for (const request of requests) {
      for (const item of request.items ?? []) {
        totals[item.order_line_id] = (totals[item.order_line_id] ?? 0) + item.quantity;
      }
    }

    return totals;
  }

  /** Records a reviewer's decision. Attributable, per ADM-015. */
  async decide(input: {
    requestId: string;
    status: "approved" | "rejected" | "received" | "completed";
    reviewedBy: string;
    decisionReason?: string | null;
  }): Promise<void> {
    await this.updateReturnRequests({
      selector: { id: input.requestId },
      data: {
        status: input.status,
        reviewed_at: new Date(),
        reviewed_by: input.reviewedBy,
        decision_reason: input.decisionReason ?? null,
      },
    });
  }
}

export default ReturnsService;
