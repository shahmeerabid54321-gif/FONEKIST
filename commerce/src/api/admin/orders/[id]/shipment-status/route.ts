import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows";
import {
  buildEvent,
  canTransitionCourier,
  COURIER_STATES,
  isTerminalCourierState,
  type CourierState,
} from "@pk/contracts";
import { randomUUID } from "node:crypto";
import { IDEMPOTENCY_MODULE } from "../../../../../modules/idempotency";
import type IdempotencyService from "../../../../../modules/idempotency/service";
import { fail, ok, requestIdOf } from "../../../../../lib/http";

/**
 * POST /admin/orders/:id/shipment-status
 *
 * Manual shipment tracking. Source of truth: FUL-003, FUL-004 and
 * 07_SYSTEM_ARCHITECTURE.md section 11.
 *
 * No courier API is contracted, and 07 section 13 requires that a courier outage must not
 * stop an order shipping: staff book by hand and record the tracking number here. That is
 * also the permanent fallback once an integration exists — every courier has an outage.
 *
 * The canonical state is kept on the fulfilment rather than inferred from Medusa's
 * shipped/delivered flags, because Medusa models three outcomes and the customer-facing
 * timeline needs ten. Transitions are validated: shipment updates arrive out of order, and
 * a stale `in_transit` must not overwrite `delivered`.
 */

interface Body {
  fulfillment_id?: string;
  state?: CourierState;
  tracking_number?: string;
  tracking_url?: string;
  courier_name?: string;
  note?: string;
}

interface TrackingEvent {
  state: CourierState;
  note: string | null;
  recorded_by: string;
  occurred_at: string;
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const orderId = req.params.id;

  try {
    const body = (req.body ?? {}) as Body;
    const target = body.state;

    if (!target || !COURIER_STATES.includes(target)) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "Choose a valid shipment state.",
            field_errors: { state: [`Must be one of: ${COURIER_STATES.join(", ")}.`] },
          },
          requestId,
        ),
      );
      return;
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "fulfillments.id", "fulfillments.metadata", "fulfillments.delivered_at"],
      filters: { id: orderId },
    });

    const order = orders?.[0];
    if (!order) {
      res.status(404).json(fail({ code: "NOT_FOUND", message: "Order not found." }, requestId));
      return;
    }

    const fulfillments = (order.fulfillments ?? []) as {
      id: string;
      metadata: Record<string, unknown> | null;
      delivered_at: string | null;
    }[];

    const fulfillment = body.fulfillment_id
      ? fulfillments.find((entry) => entry.id === body.fulfillment_id)
      : fulfillments[0];

    if (!fulfillment) {
      res.status(409).json(
        fail(
          {
            code: "CONFLICT",
            message: "Create a fulfilment for this order before recording a shipment status.",
          },
          requestId,
        ),
      );
      return;
    }

    const metadata = (fulfillment.metadata ?? {}) as Record<string, unknown>;
    const current = (metadata.courier_state as CourierState | undefined) ?? "pending";

    if (!canTransitionCourier(current, target)) {
      res.status(409).json(
        fail(
          {
            code: "CONFLICT",
            message: isTerminalCourierState(current)
              ? `This shipment is already ${current.replace(/_/g, " ")} and cannot be changed.`
              : `A shipment cannot go from ${current.replace(/_/g, " ")} to ${target.replace(/_/g, " ")}.`,
          },
          requestId,
        ),
      );
      return;
    }

    const actor =
      (req as unknown as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ?? "unknown";

    const idempotency: IdempotencyService = req.scope.resolve(IDEMPOTENCY_MODULE);
    const key =
      (req.headers["idempotency-key"] as string | undefined) ??
      `shipment:${fulfillment.id}:${target}`;

    const { result, replayed } = await idempotency.execute({
      key,
      // TRD section 7 lists courier shipment creation as a duplicate-risk write.
      operation: "courier.shipment.create",
      request: { orderId, fulfillmentId: fulfillment.id, target },
      run: async () => {
        const fulfillmentService = req.scope.resolve(Modules.FULFILLMENT);

        const events = Array.isArray(metadata.tracking_events)
          ? (metadata.tracking_events as TrackingEvent[])
          : [];

        events.push({
          state: target,
          note: body.note ?? null,
          // ADM-015: a privileged operational change is attributable.
          recorded_by: actor,
          occurred_at: new Date().toISOString(),
        });

        await fulfillmentService.updateFulfillment(fulfillment.id, {
          metadata: {
            ...metadata,
            courier_state: target,
            courier_name: body.courier_name ?? metadata.courier_name ?? null,
            tracking_number: body.tracking_number ?? metadata.tracking_number ?? null,
            tracking_url: body.tracking_url ?? metadata.tracking_url ?? null,
            booking_mode: "manual",
            tracking_events: events,
          },
        });

        // Medusa models delivery itself, and its own flag drives inventory and returns
        // eligibility. Recording the canonical state without telling Medusa would leave the
        // two disagreeing about whether the customer has the goods.
        if (target === "delivered" && !fulfillment.delivered_at) {
          await markOrderFulfillmentAsDeliveredWorkflow(req.scope).run({
            input: { orderId, fulfillmentId: fulfillment.id },
          });
        }

        const eventBus = req.scope.resolve(Modules.EVENT_BUS);
        const domainEvent = buildEvent("shipment.status_changed.v1", {
          eventId: `evt_${randomUUID()}`,
          aggregateId: orderId,
          correlationId: requestId,
          data: {
            order_id: orderId,
            shipment_id: fulfillment.id,
            tracking_number: body.tracking_number ?? (metadata.tracking_number as string | null) ?? null,
            state: target,
            previous_state: current,
          },
        });

        await eventBus.emit({ name: domainEvent.event_type, data: domainEvent });

        return {
          result: { fulfillment_id: fulfillment.id, courier_state: target, previous_state: current },
          reference: fulfillment.id,
        };
      },
    });

    res.json(ok({ ...result, replayed }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
