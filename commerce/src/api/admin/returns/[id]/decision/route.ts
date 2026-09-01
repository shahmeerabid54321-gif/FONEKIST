import { randomUUID } from "node:crypto";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { buildEvent } from "@pk/contracts";
import { RETURNS_MODULE } from "../../../../../modules/returns";
import type ReturnsService from "../../../../../modules/returns/service";
import { IDEMPOTENCY_MODULE } from "../../../../../modules/idempotency";
import type IdempotencyService from "../../../../../modules/idempotency/service";
import { fail, ok, requestIdOf } from "../../../../../lib/http";
import { sendNotification } from "../../../../../lib/notifications/send";

/**
 * POST /admin/returns/:id/decision
 *
 * Records a reviewer's decision on a return request (08_DATA_MODEL.md section 13).
 *
 * A rejection must carry a reason. "Your return was refused" with no explanation is the
 * single most common way a returns process destroys the trust the rest of the product is
 * built to create, and the reason is what support quotes back to the customer.
 */

const DECISIONS = ["approved", "rejected", "received", "completed"] as const;
type Decision = (typeof DECISIONS)[number];

/** What the customer is told, per decision. */
const CUSTOMER_STATUS: Record<Decision, string> = {
  approved: "approved — please send the item back",
  rejected: "not approved",
  received: "received by us and being inspected",
  completed: "completed",
};

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const id = req.params.id;

  try {
    const body = (req.body ?? {}) as { status?: Decision; decision_reason?: string };
    const status = body.status;

    if (!status || !DECISIONS.includes(status)) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: `status must be one of: ${DECISIONS.join(", ")}.`,
            field_errors: { status: [`Must be one of: ${DECISIONS.join(", ")}.`] },
          },
          requestId,
        ),
      );
      return;
    }

    if (status === "rejected" && !body.decision_reason?.trim()) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "Give a reason when refusing a return. The customer will be told this.",
            field_errors: { decision_reason: ["Required when refusing a return."] },
          },
          requestId,
        ),
      );
      return;
    }

    const returns: ReturnsService = req.scope.resolve(RETURNS_MODULE);
    const [request] = (await returns.listReturnRequests({ id })) as unknown as {
      id: string;
      order_id: string;
      order_reference: string;
      status: string;
      requested_resolution: "refund" | "replacement" | "repair";
    }[];

    if (!request) {
      res.status(404).json(fail({ code: "NOT_FOUND", message: "Return request not found." }, requestId));
      return;
    }

    const actor =
      (req as unknown as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ?? "unknown";

    const idempotency: IdempotencyService = req.scope.resolve(IDEMPOTENCY_MODULE);
    const key = (req.headers["idempotency-key"] as string | undefined) ?? `return:${id}:${status}`;

    const { result, replayed } = await idempotency.execute({
      key,
      operation: "return.decision",
      request: { id, status },
      run: async () => {
        await returns.decide({
          requestId: id,
          status,
          reviewedBy: actor,
          decisionReason: body.decision_reason ?? null,
        });

        if (status === "approved") {
          const eventBus = req.scope.resolve(Modules.EVENT_BUS);
          const domainEvent = buildEvent("return.approved.v1", {
            eventId: `evt_${randomUUID()}`,
            aggregateId: request.order_id,
            correlationId: requestId,
            data: {
              return_request_id: id,
              order_id: request.order_id,
              resolution: request.requested_resolution,
            },
          });
          await eventBus.emit({ name: domainEvent.event_type, data: domainEvent });
        }

        // Told to the customer on every decision, not only the happy one: silence after a
        // refusal is what turns a return into a complaint.
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { data: orders } = await query.graph({
          entity: "order",
          fields: ["email", "display_id"],
          filters: { id: request.order_id },
        });

        const email = orders?.[0]?.email;
        if (email) {
          await sendNotification(req.scope, {
            to: email,
            channel: "email",
            template: "return.status_changed",
            data: {
              order_reference: request.order_reference,
              status: CUSTOMER_STATUS[status],
              reason: body.decision_reason ?? null,
            },
            idempotencyKey: `return-decision:${id}:${status}`,
          });
        }

        return { result: { return_request_id: id, status }, reference: id };
      },
    });

    res.json(ok({ ...result, replayed }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
