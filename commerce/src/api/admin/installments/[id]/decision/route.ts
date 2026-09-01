import { randomUUID } from "node:crypto";
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows";
import { buildEvent, installmentDecisionRequestSchema, type InstallmentState } from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../../../modules/installments";
import type InstallmentsService from "../../../../../modules/installments/service";
import { IDEMPOTENCY_MODULE } from "../../../../../modules/idempotency";
import type IdempotencyService from "../../../../../modules/idempotency/service";
import { fail, ok, requestIdOf } from "../../../../../lib/http";
import { sendNotification } from "../../../../../lib/notifications/send";
import { retentionDays } from "../../../../../lib/installment-terms";

/**
 * POST /admin/installments/:id/decision
 *
 * A reviewer approves, rejects, or asks for more information.
 *
 * This is the only thing in the system that can authorise an installment order. There is no
 * webhook and no return URL that reaches it (ADR-007): the payment provider's `approved`
 * flag is written here and nowhere else.
 *
 * Idempotent (INST-008). A double-clicked approval would otherwise send the customer two
 * messages, write two audit trails and emit two events for one act.
 *
 * Every decision requires a note. An unexplained rejection cannot be reviewed by a
 * supervisor or explained to the person it was about.
 */

const NEXT_STATE: Record<string, InstallmentState> = {
  approve: "approved",
  reject: "rejected",
  request_information: "more_information_required",
};

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    if (!idempotencyKey) {
      res.status(400).json(
        fail(
          { code: "VALIDATION_ERROR", message: "This request requires an Idempotency-Key header." },
          requestId,
        ),
      );
      return;
    }

    const parsed = installmentDecisionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "Record a decision and the reason for it.",
            field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
          },
          requestId,
        ),
      );
      return;
    }

    const applicationId = String(req.params.id ?? "");
    const actor = req.auth_context?.actor_id ?? "unknown";
    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const idempotency: IdempotencyService = req.scope.resolve(IDEMPOTENCY_MODULE);

    const { result } = await idempotency.execute({
      key: idempotencyKey,
      operation: "installment.decision",
      request: { applicationId, decision: parsed.data.decision },
      run: async () => {
        const row = (await installments.retrieveInstallmentApplication(
          applicationId,
        )) as never as Parameters<typeof installments.toSafeView>[0];

        /*
         * `under_review` is entered on the way to a decision rather than as a separate
         * button. Reading an application is reviewing it, and requiring a reviewer to click
         * "start review" first only produces applications that were decided from `submitted`
         * because somebody skipped the step.
         */
        if (row.state === "submitted") {
          await installments.transition(applicationId, "under_review", { actor });
        }

        const nextState = NEXT_STATE[parsed.data.decision]!;
        await installments.transition(applicationId, nextState, {
          actor,
          note: parsed.data.note,
        });

        const now = new Date();
        await installments.updateInstallmentApplications({
          selector: { id: applicationId },
          data: {
            decided_at: now,
            decided_by: actor,
            decision_note: parsed.data.note,
            // Approval keeps the reservation, because the order is going ahead. The other
            // two outcomes release it: a rejected application must not hold the last unit,
            // and one waiting on the customer keeps its existing deadline.
            ...(nextState === "approved" ? { reserved_until: null } : {}),
            // The retention clock restarts from the decision (SEC-007, ADR-025).
            purge_after: new Date(now.getTime() + retentionDays() * 24 * 60 * 60 * 1000),
          },
        } as never);

        /*
         * Approval is what flips the payment session's `approved` flag, which is the only
         * input `getPaymentStatus` trusts. Rejection cancels the order, which releases the
         * reserved handset through Medusa's own inventory handling rather than through a
         * second, competing reservation of ours.
         */
        if (row.order_id) {
          if (nextState === "approved") {
            await markPaymentApproved(req, row.order_id);
          } else if (nextState === "rejected") {
            await cancelOrderWorkflow(req.scope)
              .run({ input: { order_id: row.order_id } })
              .catch((error) => {
                // A cancellation failure must not lose the decision, which is already
                // recorded. It is loud in the log and the queue still shows it as rejected.
                logger.error(
                  `[installments] could not cancel order ${row.order_id} after rejecting ${applicationId}: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                );
              });
          }
        }

        const template =
          nextState === "approved"
            ? ("installment.approved" as const)
            : nextState === "rejected"
              ? ("installment.rejected" as const)
              : ("installment.information_required" as const);

        await sendNotification(req.scope, {
          to: row.applicant_email,
          channel: "email",
          template,
          data: {
            application_reference: row.reference,
            advance: row.advance_pkr,
            monthly: row.monthly_pkr,
            tenure_months: row.tenure_months,
            total: row.total_payable_pkr,
            // The reviewer's note goes to the customer only when it is an instruction to
            // them. A rejection reason is an internal assessment and is not sent verbatim.
            missing: nextState === "more_information_required" ? parsed.data.note : null,
            reason: null,
          },
          idempotencyKey: `installment-decision:${applicationId}:${nextState}`,
        });

        const eventBus = req.scope.resolve(Modules.EVENT_BUS);
        const domainEvent = buildEvent("installment.decision.recorded.v1", {
          eventId: `evt_${randomUUID()}`,
          aggregateId: applicationId,
          correlationId: requestId,
          data: {
            application_id: applicationId,
            order_id: row.order_id,
            decision:
              nextState === "approved"
                ? ("approved" as const)
                : nextState === "rejected"
                  ? ("rejected" as const)
                  : ("more_information_required" as const),
          },
        });
        await eventBus.emit({ name: domainEvent.event_type, data: domainEvent });

        logger.info(`[installments] ${row.reference} → ${nextState} by ${actor}`);

        return {
          result: { application_id: applicationId, state: nextState, reference: row.reference },
          reference: applicationId,
        };
      },
    });

    res.json(ok(result, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}

/**
 * Writes the approval onto the payment session.
 *
 * The provider reads `approved` and nothing else, so this one write is the whole of
 * "a human said yes". It is deliberately not derivable from anything a browser sends.
 */
async function markPaymentApproved(req: AuthenticatedMedusaRequest, orderId: string): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "payment_collections.payment_sessions.id", "payment_collections.payment_sessions.data"],
    filters: { id: orderId },
  });

  const sessions =
    (orders?.[0] as unknown as {
      payment_collections?: { payment_sessions?: { id: string; data: Record<string, unknown> }[] }[];
    })?.payment_collections?.flatMap((collection) => collection.payment_sessions ?? []) ?? [];

  const payment = req.scope.resolve(Modules.PAYMENT);
  for (const session of sessions) {
    await payment.updatePaymentSession({
      id: session.id,
      data: { ...session.data, approved: true, approved_at: new Date().toISOString() },
      currency_code: "pkr",
      amount: Number((session.data as { amount?: number }).amount ?? 0),
    } as never);
  }
}
