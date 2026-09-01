import { randomUUID } from "node:crypto";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { buildEvent } from "@pk/contracts";
import { RETURNS_MODULE } from "../../../modules/returns";
import type ReturnsService from "../../../modules/returns/service";
import {
  checkReturnEligibility,
  RETURN_REASON_CODES,
  returnWindowDays,
} from "../../../modules/returns/eligibility";
import { clientIpOf, fail, ok, requestIdOf } from "../../../lib/http";
import { normalizePkMobile, phonesMatch } from "../../../lib/phone-match";
import { rateLimit } from "../../../lib/rate-limit";
import { sendNotification } from "../../../lib/notifications/send";

/**
 * POST /store/return-requests
 *
 * Named `return-requests`, not `returns`: Medusa's store API already owns `/store/returns`
 * for its own return flow, and mounting a custom route on the same path silently loses to
 * it. The name is also more accurate — this is a customer's *request*, which a human
 * reviews before any return exists.
 *
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 4 — "requires eligibility and
 * authenticated/secure-order context".
 *
 * Guest checkout means most returns come from people with no account (ADR-008), so the
 * order reference plus the phone used at checkout is the second factor, exactly as for
 * order lookup. As there, an unknown order and a wrong phone give the identical response,
 * so this cannot be used to discover which order references exist (SEC-004).
 */

const LIMIT = 5;
const WINDOW_SECONDS = 15 * 60;

interface Body {
  order_reference?: string | number;
  phone?: string;
  reason_code?: string;
  requested_resolution?: "refund" | "replacement" | "repair";
  notes?: string;
  items?: { order_line_id?: string; quantity?: number }[];
}

/** The same answer for "no such order" and "wrong phone". */
function notFound(res: MedusaResponse, requestId: string): void {
  res.status(404).json(
    fail(
      {
        code: "NOT_FOUND",
        message: "We could not find an order with those details. Check the reference and phone number.",
      },
      requestId,
    ),
  );
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  const limit = rateLimit(`returns:${clientIpOf(req)}`, LIMIT, WINDOW_SECONDS);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfterSeconds));
    res.status(429).json(
      fail({ code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes." }, requestId),
    );
    return;
  }

  try {
    const body = (req.body ?? {}) as Body;

    // Kept as a string: `display_id` is typed as a string in the query graph even though
    // the column is numeric, and passing a number is rejected at the type level.
    const reference = String(body.order_reference ?? "").trim().replace(/^#/, "");
    const phone = normalizePkMobile(String(body.phone ?? ""));
    const reasonCode = String(body.reason_code ?? "");
    const resolution = body.requested_resolution ?? "refund";
    const requested = (body.items ?? [])
      .map((item) => ({
        orderLineId: String(item.order_line_id ?? ""),
        quantity: Math.floor(Number(item.quantity ?? 0)),
      }))
      .filter((item) => item.orderLineId && item.quantity > 0);

    const fieldErrors: Record<string, string[]> = {};
    if (!/^\d+$/.test(reference)) fieldErrors.order_reference = ["Enter your order reference."];
    if (!phone) fieldErrors.phone = ["Enter the mobile number used on the order."];
    if (!RETURN_REASON_CODES.includes(reasonCode as (typeof RETURN_REASON_CODES)[number])) {
      fieldErrors.reason_code = ["Choose a reason for the return."];
    }
    if (requested.length === 0) fieldErrors.items = ["Choose at least one item to return."];

    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json(
        fail(
          { code: "VALIDATION_ERROR", message: "Please complete the return request.", field_errors: fieldErrors },
          requestId,
        ),
      );
      return;
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "status",
        "shipping_address.phone",
        "items.id",
        "items.title",
        // The ordered quantity lives on the order-item join, not on the line item itself.
        // Asking for `items.quantity` returns nothing at all — silently, which made every
        // eligibility check conclude the item was not on the order.
        "items.detail.quantity",
        "fulfillments.delivered_at",
      ],
      filters: { display_id: reference },
    });

    // The graph's generated types widen `display_id`; the shape used here is narrow and
    // read-only, so it is asserted once rather than threaded through every field.
    const order = orders?.[0] as unknown as
      | {
          id: string;
          display_id: number;
          email: string | null;
          status: string;
          shipping_address: { phone?: string | null } | null;
          items: { id: string; title: string; detail: { quantity: number } | null }[];
          fulfillments?: { delivered_at: string | null }[];
        }
      | undefined;

    if (!order) {
      notFound(res, requestId);
      return;
    }

    if (!phonesMatch(order.shipping_address?.phone, phone)) {
      notFound(res, requestId);
      return;
    }

    const returns: ReturnsService = req.scope.resolve(RETURNS_MODULE);

    const deliveredAt = order.fulfillments?.find((fulfillment) => fulfillment.delivered_at)?.delivered_at;

    const eligibility = checkReturnEligibility({
      deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
      orderCancelled: order.status === "canceled",
      alreadyRequested: await returns.requestedQuantities(order.id),
      ordered: Object.fromEntries(order.items.map((item) => [item.id, item.detail?.quantity ?? 0])),
      requested,
    });

    if (!eligibility.eligible) {
      res.status(409).json(fail({ code: "CONFLICT", message: eligibility.reason }, requestId));
      return;
    }

    const titles = new Map(order.items.map((item) => [item.id, item.title]));

    const created = await returns.createRequest({
      orderId: order.id,
      orderReference: String(order.display_id),
      reasonCode,
      requestedResolution: resolution,
      notes: body.notes ? String(body.notes).slice(0, 1000) : null,
      items: requested.map((item) => ({
        orderLineId: item.orderLineId,
        title: titles.get(item.orderLineId) ?? "Item",
        quantity: item.quantity,
      })),
    });

    const eventBus = req.scope.resolve(Modules.EVENT_BUS);
    const domainEvent = buildEvent("return.requested.v1", {
      eventId: `evt_${randomUUID()}`,
      aggregateId: order.id,
      correlationId: requestId,
      data: { return_request_id: created.id, order_id: order.id, reason_code: reasonCode },
    });
    await eventBus.emit({ name: domainEvent.event_type, data: domainEvent });

    if (order.email) {
      await sendNotification(req.scope, {
        to: order.email,
        channel: "email",
        template: "return.status_changed",
        data: {
          order_reference: order.display_id,
          status: "requested",
          reason: "We will review it and tell you what happens next.",
        },
        idempotencyKey: `return-requested:${created.id}`,
      });
    }

    res.status(201).json(
      ok(
        {
          return_request_id: created.id,
          status: "requested",
          window_days: returnWindowDays(),
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
