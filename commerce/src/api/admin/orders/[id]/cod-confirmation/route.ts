import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { canTransitionCod, type CodState } from "@pk/contracts";
import { IDEMPOTENCY_MODULE } from "../../../../../modules/idempotency";
import type IdempotencyService from "../../../../../modules/idempotency/service";
import { fail, ok, requestIdOf } from "../../../../../lib/http";

/**
 * POST /admin/orders/:id/cod-confirmation
 *
 * Records the outcome of confirming a cash-on-delivery order with the customer.
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 6 and PAY-005.
 *
 * Only a confirmed COD order may be fulfilled, so this is the gate an order operator
 * passes through before dispatch. The transition is validated against the canonical COD
 * state machine rather than trusted from the request body.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const orderId = req.params.id;

  try {
    const body = req.body as { state?: CodState; reason_code?: string; note?: string };
    const target = body.state;

    if (target !== "cod_confirmed" && target !== "cod_rejected") {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "state must be cod_confirmed or cod_rejected.",
            field_errors: { state: ["Must be cod_confirmed or cod_rejected."] },
          },
          requestId,
        ),
      );
      return;
    }

    const orderService = req.scope.resolve(Modules.ORDER);
    const [order] = await orderService.listOrders({ id: orderId });

    if (!order) {
      res.status(404).json(fail({ code: "NOT_FOUND", message: "Order not found." }, requestId));
      return;
    }

    const metadata = (order.metadata ?? {}) as Record<string, unknown>;
    const current = (metadata.cod_state as CodState | undefined) ?? "cod_pending_confirmation";

    if (!canTransitionCod(current, target)) {
      res.status(409).json(
        fail(
          {
            code: "CONFLICT",
            message: `This order is already ${current.replace("cod_", "").replace(/_/g, " ")} and cannot be changed to ${target.replace("cod_", "").replace(/_/g, " ")}.`,
          },
          requestId,
        ),
      );
      return;
    }

    // ADM-011 / TRD section 7: a permissioned operational write is idempotent, so a
    // double-clicked confirmation records one decision, not two.
    const idempotency: IdempotencyService = req.scope.resolve(IDEMPOTENCY_MODULE);
    const key =
      (req.headers["idempotency-key"] as string | undefined) ?? `cod:${orderId}:${target}`;

    const { result, replayed } = await idempotency.execute({
      key,
      operation: "order.complete",
      request: { orderId, target },
      run: async () => {
        await orderService.updateOrders([
          {
            id: orderId,
            metadata: {
              ...metadata,
              cod_state: target,
              cod_reason_code: body.reason_code ?? null,
              cod_note: body.note ?? null,
              // ADM-015: privileged changes must be attributable.
              cod_decided_by: (req as unknown as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ?? "unknown",
              cod_decided_at: new Date().toISOString(),
            },
          },
        ]);

        return { result: { order_id: orderId, cod_state: target }, reference: orderId };
      },
    });

    res.json(ok({ ...result, replayed }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
