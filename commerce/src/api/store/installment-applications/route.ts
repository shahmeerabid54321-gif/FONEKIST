import { randomUUID } from "node:crypto";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  addShippingMethodToCartWorkflow,
  completeCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
  updateCartWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  REQUIRED_DOCUMENT_KINDS,
  buildEvent,
  installmentApplicationRequestSchema,
  installmentDisclosure,
  isPlanOfferable,
} from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../modules/installments";
import type InstallmentsService from "../../../modules/installments/service";
import { IDEMPOTENCY_MODULE } from "../../../modules/idempotency";
import type IdempotencyService from "../../../modules/idempotency/service";
import { clientIpOf, fail, ok, requestIdOf } from "../../../lib/http";
import { rateLimit } from "../../../lib/rate-limit";
import { sendNotification } from "../../../lib/notifications/send";
import { consentText, reservationTtlHours, retentionDays, termsVersion } from "../../../lib/installment-terms";

/**
 * POST /store/installment-applications
 *
 * Submits a credit application and, if everything checks out, places the order behind it.
 *
 * The order is created with its payment authorisation **deferred** (the `installment`
 * provider returns `pending_authorization`), so it exists, holds its stock, and is visibly
 * not a completed sale. Nothing is authorised and nothing is captured until a reviewer
 * decides (ADR-023).
 *
 * Order creation is also what reserves the handset. Medusa reserves inventory when the
 * order is created, so `reserved_until` is a deadline on that existing reservation rather
 * than a second, competing hold — two reservations for one application would double-count
 * the last unit in stock (D3, INST-009).
 *
 * The whole thing runs inside the idempotency module. A double-tapped submit on a phone
 * with a slow connection is the normal case, not the exotic one, and without this it would
 * produce two applications, two orders and two reservations (INST-007).
 */

const LIMIT = 5;
const WINDOW_SECONDS = 30 * 60;

/** Medusa composes a provider id as `pp_<identifier>_<configured id>`. */
const PROVIDER_ID = "pp_installment_installment";

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  const limit = rateLimit(`installment-apply:${clientIpOf(req)}`, LIMIT, WINDOW_SECONDS);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfterSeconds));
    res.status(429).json(
      fail({ code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes." }, requestId),
    );
    return;
  }

  try {
    const idempotencyKey =
      (req.headers["idempotency-key"] as string | undefined) ??
      (req.headers["Idempotency-Key"] as string | undefined);

    if (!idempotencyKey) {
      res.status(400).json(
        fail(
          { code: "VALIDATION_ERROR", message: "This request requires an Idempotency-Key header." },
          requestId,
        ),
      );
      return;
    }

    const parsed = installmentApplicationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "Please check the details on this application.",
            field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
          },
          requestId,
        ),
      );
      return;
    }

    const input = parsed.data;
    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const idempotency: IdempotencyService = req.scope.resolve(IDEMPOTENCY_MODULE);
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    const { result } = await idempotency.execute({
      key: idempotencyKey,
      operation: "installment.application.submit",
      // The CNIC is deliberately not part of the hash: the record is queryable by
      // operators, and a hash is still a token derived from it (ADR-024).
      request: { cart_id: input.cart_id, plan_id: input.plan_id, documents: input.document_ids },
      run: async () => {
        /* -- The cart ------------------------------------------------------------- */
        const { data: carts } = await query.graph({
          entity: "cart",
          fields: [
            "id",
            "total",
            "completed_at",
            "items.id",
            "items.quantity",
            "items.variant_id",
            "items.product_id",
          ],
          filters: { id: input.cart_id },
        });

        const cart = carts?.[0] as unknown as
          | {
              id: string;
              total: number;
              completed_at: string | null;
              items: { id: string; quantity: number; variant_id: string; product_id: string }[];
            }
          | undefined;

        if (!cart || cart.completed_at) {
          throw Object.assign(new Error("cart"), {
            httpStatus: 404,
            responseError: {
              code: "NOT_FOUND" as const,
              message: "That basket is no longer available. Start again from the product page.",
            },
          });
        }

        /*
         * One handset, quantity one (INST-005).
         *
         * Enforced here rather than in the checkout UI because the browser is untrusted:
         * hiding the quantity control is not a control. Two handsets on one agreement is a
         * different credit decision from the one the plan was priced for.
         */
        if (cart.items.length !== 1 || cart.items[0]!.quantity !== 1) {
          throw Object.assign(new Error("cart-shape"), {
            httpStatus: 409,
            responseError: {
              code: "CONFLICT" as const,
              message: "An installment plan covers one handset. Please apply for one at a time.",
            },
          });
        }

        const line = cart.items[0]!;

        /* -- The plan ------------------------------------------------------------- */
        const plan = await installments
          .retrieveInstallmentPlan(input.plan_id)
          .catch(() => null);

        if (!plan || !isPlanOfferable(plan as never)) {
          throw Object.assign(new Error("plan"), {
            httpStatus: 409,
            responseError: {
              code: "CONFLICT" as const,
              message: "That plan is no longer available. Please choose another one.",
            },
          });
        }

        if (plan.variant_id !== line.variant_id) {
          throw Object.assign(new Error("plan-variant"), {
            httpStatus: 409,
            responseError: {
              code: "CONFLICT" as const,
              message: "That plan is for a different model. Please choose a plan for this handset.",
            },
          });
        }

        /*
         * The disclosure is recomputed from the live cart total, not from the figure the
         * plan was authored against. If the cash price has moved since, the customer is
         * shown the plan they can actually have rather than one that no longer exists.
         */
        const disclosure = installmentDisclosure(plan as never, Number(cart.total));

        /* -- The documents -------------------------------------------------------- */
        const documents = (await installments.listInstallmentDocuments({
          id: input.document_ids,
        })) as unknown as {
          id: string;
          kind: string;
          scan_status: string;
          application_id: string | null;
        }[];

        if (documents.length !== input.document_ids.length) {
          throw Object.assign(new Error("documents"), {
            httpStatus: 400,
            responseError: {
              code: "VALIDATION_ERROR" as const,
              message: "One of your uploads could not be found. Please upload it again.",
            },
          });
        }

        // A document already attached to another application cannot be reused. Without
        // this, one person's CNIC could be pointed at somebody else's application.
        if (documents.some((document) => document.application_id !== null)) {
          throw Object.assign(new Error("documents-claimed"), {
            httpStatus: 409,
            responseError: {
              code: "CONFLICT" as const,
              message: "One of those uploads belongs to another application.",
            },
          });
        }

        const kinds = new Set(documents.map((document) => document.kind));
        const missing = REQUIRED_DOCUMENT_KINDS.filter((kind) => !kinds.has(kind));
        if (missing.length > 0) {
          throw Object.assign(new Error("documents-missing"), {
            httpStatus: 400,
            responseError: {
              code: "VALIDATION_ERROR" as const,
              message: "Please upload both sides of your CNIC and your guarantor's CNIC.",
            },
          });
        }

        /*
         * The delivery address and a shipping method, before the order can exist.
         *
         * The applicant gave us their address on the form, so there is no second step to
         * ask them for it. Medusa refuses to complete a cart of physical goods with no
         * shipping method, and rightly: an order with nowhere to go is not an order.
         */
        const address = input.applicant.address;
        const [firstName, ...restOfName] = address.full_name.split(" ");

        await updateCartWorkflow(req.scope).run({
          input: {
            id: cart.id,
            email: input.applicant.email,
            shipping_address: {
              first_name: firstName ?? address.full_name,
              last_name: restOfName.join(" ") || "-",
              phone: address.phone,
              address_1: address.street,
              // Area and landmark are how a Pakistani address is actually found; a courier
              // relies on them far more than on a postal code, and Medusa has no field for
              // either, so they are joined into the second address line rather than lost.
              address_2: [address.area, address.landmark].filter(Boolean).join(", "),
              city: address.city,
              province: address.province,
              country_code: "pk",
            },
          },
        });

        const { result: shippingOptions } = await listShippingOptionsForCartWithPricingWorkflow(
          req.scope,
        ).run({ input: { cart_id: cart.id } });

        const option = (shippingOptions as unknown as { id: string; amount: number }[])
          .slice()
          .sort((a, b) => Number(a.amount ?? 0) - Number(b.amount ?? 0))[0];

        if (!option) {
          throw Object.assign(new Error("no-shipping"), {
            httpStatus: 409,
            responseError: {
              code: "CONFLICT" as const,
              message:
                "We do not deliver to that address yet. Please check the city and province, or contact us.",
            },
          });
        }

        // The cheapest option that serves the address. A customer applying for credit is not
        // being asked to choose an express upgrade in the middle of it, and the figure is
        // shown to them before anything is agreed.
        await addShippingMethodToCartWorkflow(req.scope).run({
          input: { cart_id: cart.id, options: [{ id: option.id }] },
        });

        /* -- Place the order with authorisation deferred --------------------------- */
        const snapshot = {
          plan_id: plan.id,
          label: plan.label,
          advance_pkr: disclosure.advance_pkr,
          monthly_pkr: disclosure.monthly_pkr,
          tenure_months: disclosure.tenure_months,
          total_payable_pkr: disclosure.total_payable_pkr,
          cash_price_pkr: disclosure.cash_price_pkr,
          difference_pkr: disclosure.difference_pkr,
          terms_version: termsVersion(),
          snapshotted_at: new Date().toISOString(),
        };

        await createPaymentCollectionForCartWorkflow(req.scope).run({
          input: { cart_id: cart.id },
        });

        const { data: refreshed } = await query.graph({
          entity: "cart",
          fields: ["id", "total", "payment_collection.id"],
          filters: { id: cart.id },
        });
        const collectionId = (refreshed?.[0] as unknown as { payment_collection: { id: string } | null })
          ?.payment_collection?.id;

        if (!collectionId) throw new Error("No payment collection for cart " + cart.id);

        // The amount the session is opened for is the cart total *after* shipping, not the
        // total the plan was priced against. The plan covers the handset; delivery is
        // charged on top and is stated separately.
        const payableTotal = Number(
          (refreshed?.[0] as unknown as { total: number })?.total ?? cart.total,
        );

        const payment = req.scope.resolve(Modules.PAYMENT);
        await payment.createPaymentSession(collectionId, {
          provider_id: PROVIDER_ID,
          currency_code: "pkr",
          amount: payableTotal,
          data: { installment_snapshot: snapshot },
          context: { idempotency_key: idempotencyKey } as never,
        });

        const { result: completed } = await completeCartWorkflow(req.scope).run({
          input: { id: cart.id },
        });
        const orderId = (completed as unknown as { id: string }).id;

        /* -- The application ------------------------------------------------------- */
        const now = new Date();
        const reservedUntil = new Date(now.getTime() + reservationTtlHours() * 60 * 60 * 1000);

        const created = (await installments.createInstallmentApplications({
          reference: installments.newReference(),
          state: "submitted",
          cart_id: cart.id,
          order_id: orderId,
          plan_id: plan.id,
          product_id: line.product_id,
          variant_id: line.variant_id,
          plan_label: snapshot.label,
          advance_pkr: snapshot.advance_pkr,
          monthly_pkr: snapshot.monthly_pkr,
          tenure_months: snapshot.tenure_months,
          total_payable_pkr: snapshot.total_payable_pkr,
          cash_price_pkr: snapshot.cash_price_pkr,
          difference_pkr: snapshot.difference_pkr,
          applicant_name: input.applicant.full_name,
          applicant_cnic: input.applicant.cnic,
          applicant_phone: input.applicant.phone,
          applicant_email: input.applicant.email,
          applicant_dob: input.applicant.date_of_birth,
          employment_type: input.applicant.employment_type,
          employer_name: input.applicant.employer_name ?? null,
          monthly_income_pkr: input.applicant.monthly_income_pkr,
          delivery_address: input.applicant.address,
          guarantor_name: input.guarantor.full_name,
          guarantor_cnic: input.guarantor.cnic,
          guarantor_phone: input.guarantor.phone,
          guarantor_relationship: input.guarantor.relationship,
          consent_version: input.consent.terms_version,
          // The exact wording shown, stored verbatim. A boolean cannot answer "agreed to
          // what", which is the only question that matters if this is ever disputed.
          consent_text: consentText(input.consent.terms_version),
          consent_at: now,
          reservation_id: orderId,
          reserved_until: reservedUntil,
          // Set on submission, moved forward on a decision. An application that is never
          // decided still has a deletion date (SEC-007).
          purge_after: new Date(now.getTime() + retentionDays() * 24 * 60 * 60 * 1000),
        } as never)) as unknown as { id: string; reference: string } | { id: string; reference: string }[];

        const application = Array.isArray(created) ? created[0]! : created;

        await installments.updateInstallmentDocuments({
          selector: { id: input.document_ids },
          data: { application_id: application.id },
        } as never);

        await installments.recordAudit({
          application_id: application.id,
          action: "application.submitted",
          actor: "customer",
          to_state: "submitted",
          detail: { order_id: orderId, plan_id: plan.id, documents: input.document_ids.length },
        });

        const eventBus = req.scope.resolve(Modules.EVENT_BUS);
        const domainEvent = buildEvent("installment.application.submitted.v1", {
          eventId: `evt_${randomUUID()}`,
          aggregateId: application.id,
          correlationId: requestId,
          data: { application_id: application.id, order_id: orderId, plan_id: plan.id },
        });
        await eventBus.emit({ name: domainEvent.event_type, data: domainEvent });

        await sendNotification(req.scope, {
          to: input.applicant.email,
          channel: "email",
          template: "installment.received",
          data: {
            application_reference: application.reference,
            advance: snapshot.advance_pkr,
            monthly: snapshot.monthly_pkr,
            tenure_months: snapshot.tenure_months,
          },
          idempotencyKey: `installment-received:${application.id}`,
        });

        logger.info(`[installments] application ${application.reference} submitted for order ${orderId}`);

        return {
          result: {
            application_id: application.id,
            reference: application.reference,
            state: "submitted" as const,
            order_id: orderId,
            reserved_until: reservedUntil.toISOString(),
            plan: { label: snapshot.label, ...disclosure },
          },
          reference: application.id,
        };
      },
    });

    res.status(201).json(ok(result, requestId));
  } catch (error) {
    const explicit = error as { httpStatus?: number; responseError?: { code: string; message: string } };
    if (explicit?.responseError && explicit.httpStatus) {
      res.status(explicit.httpStatus).json(fail(explicit.responseError, requestId));
      return;
    }
    /*
     * Logged before the envelope hides it.
     *
     * `fail` deliberately lets nothing internal cross the boundary, which is right, but an
     * INTERNAL_ERROR with no server-side record is undiagnosable: the customer sees "try
     * again" and there is nothing to look at. The request id ties the two together.
     */
    /*
     * Logged before the envelope hides it, with the cause rather than only the top message.
     *
     * `AppError` deliberately presents a safe message to the customer, which is right; but
     * logging only that reports "something went wrong" to the operator too, and an
     * INTERNAL_ERROR nobody can diagnose is an outage with no evidence. The request id ties
     * the log line to what the customer saw.
     *
     * The request body is deliberately NOT logged: it carries a CNIC (ADR-024).
     */
    const detail = error as { message?: string; stack?: string; internal?: unknown; cause?: unknown };
    logger.error(
      `[installments] submission ${requestId} failed: ${detail?.message ?? String(error)}\n` +
        `cause: ${
          detail?.cause instanceof Error
            ? `${detail.cause.message}\n${detail.cause.stack}`
            : JSON.stringify(detail?.cause ?? null)
        }\n` +
        `internal: ${JSON.stringify(detail?.internal ?? null)}\n` +
        `${detail?.stack ?? ""}`,
    );

    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
