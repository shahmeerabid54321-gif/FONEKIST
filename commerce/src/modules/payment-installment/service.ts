import { AbstractPaymentProvider, MedusaError } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";

export interface InstallmentPaymentOptions {
  /** Merchant ceiling on the retail value of a single installment order. */
  maxOrderValuePkr: number;
}

type InjectedDependencies = { logger: Logger };

/**
 * Installment orders.
 *
 * Modelled on the COD provider and deliberately one step further back than it.
 *
 * COD returns `authorized` at checkout: the order is real, the goods will ship, only the
 * cash has not moved yet. An installment order is not that. Nobody has agreed to sell
 * anything until a human has read the application, so `authorizePayment` returns
 * **`pending_authorization`**. An order sitting at `authorized` would mean a sale we have
 * not agreed to, against stock we would then have to honour, at a price nobody underwrote.
 *
 * `pending_authorization` rather than plain `pending` is load-bearing, not cosmetic. Medusa
 * 2.19 treats `pending_authorization` as deferred authorisation — the shape a bank transfer
 * has — and lets cart completion proceed while creating **no payment record at all**. A
 * plain `pending` falls through to the final branch of `authorizePaymentSessionStep` and
 * raises `PAYMENT_AUTHORIZATION_ERROR`, so the customer would simply be unable to submit an
 * application. The two words describe the same intent; only one of them expresses it in a
 * way the order pipeline understands.
 *
 * Nothing here ever captures. The advance is collected off-site and the monthly payments
 * are serviced off-site; a `captured` status on this provider would put money in the
 * revenue figures that no one has received (ADR-023, PAY-004).
 *
 * ADR-007 applies unchanged: a browser redirect is never payment truth. There is no return
 * URL that can move an application forward, and `getWebhookActionAndData` refuses to act,
 * because the only thing that approves an installment order is a reviewer's decision
 * written through the admin API.
 */
class InstallmentPaymentProviderService extends AbstractPaymentProvider<InstallmentPaymentOptions> {
  static identifier = "installment";

  protected readonly logger_: Logger;
  protected readonly options_: InstallmentPaymentOptions;

  constructor(container: InjectedDependencies, options: InstallmentPaymentOptions) {
    super(container, options);
    this.logger_ = container.logger;
    this.options_ = options;
  }

  static validateOptions(options: Record<string, unknown>): void {
    const max = Number(options.maxOrderValuePkr);
    if (!Number.isFinite(max) || max <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Installment provider requires a positive maxOrderValuePkr.",
      );
    }
  }

  /**
   * Opens the session and records the plan snapshot on it.
   *
   * The snapshot is written at this moment and never re-read from the catalogue, so editing
   * a plan afterwards cannot change what the customer agreed to (INST-006, the same rule
   * as WAR-001).
   */
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const amount = Number(input.amount);

    if (amount > this.options_.maxOrderValuePkr) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Installments are available for orders up to Rs ${this.options_.maxOrderValuePkr.toLocaleString("en-PK")}.`,
      );
    }

    const snapshot = (input.data as { installment_snapshot?: unknown } | undefined)
      ?.installment_snapshot;

    if (!snapshot) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "An installment payment needs the agreed plan attached to it.",
      );
    }

    const reference = `inst_${input.context?.idempotency_key ?? crypto.randomUUID()}`;

    return {
      id: reference,
      data: {
        reference,
        amount,
        currency_code: input.currency_code,
        installment_snapshot: snapshot,
        installment_state: "installment_pending_review",
        approved: false,
      },
    };
  }

  /**
   * Places the order with its authorisation deferred to a human.
   *
   * `pending_authorization`, not `authorized`. This is the single most important line in
   * the module: an unapproved application must not produce an order that reads as a
   * completed sale, and no payment record exists until a reviewer says so.
   */
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return {
      status: "pending_authorization",
      data: {
        ...input.data,
        installment_state: "installment_pending_review",
        submitted_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Nothing is captured on the website. The advance is collected off-site and the monthly
   * payments are serviced off-site, so a capture here would record money we do not have.
   */
  async capturePayment(_input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Installment payments are collected off the website and are never captured here.",
    );
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return {
      data: {
        ...input.data,
        installment_state: "installment_cancelled",
        cancelled_at: new Date().toISOString(),
      },
    };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * Status comes from the `approved` flag the admin decision writes, and from nowhere else.
   * In particular it is not derived from anything a browser could have sent.
   */
  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as { approved?: boolean; installment_state?: string };
    if (data.installment_state === "installment_cancelled") {
      return { status: "canceled", data: input.data };
    }
    if (data.installment_state === "installment_rejected") {
      return { status: "canceled", data: input.data };
    }
    // Approved means the goods may now ship against an agreed receivable. It is still not
    // captured: no money has reached us through this provider, and it never will.
    if (data.approved === true) return { status: "authorized", data: input.data };
    return { status: "pending_authorization", data: input.data };
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "There is nothing to refund here: no payment is taken through this provider.",
    );
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * The amount may change while the cart is still open, but the agreed plan may not.
   * Rewriting a snapshot through an update would be exactly the catalogue-edit-rewrites-a
   * -purchase failure that INST-006 exists to prevent.
   */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const amount = Number(input.amount);
    if (amount > this.options_.maxOrderValuePkr) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Installments are available for orders up to Rs ${this.options_.maxOrderValuePkr.toLocaleString("en-PK")}.`,
      );
    }
    return { data: { ...input.data, amount } };
  }

  /**
   * There is no third party, so there is no webhook. Returning `not_supported` rather than
   * quietly succeeding matters: an endpoint that accepted a payload here would be an
   * unauthenticated way to approve credit.
   */
  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    return { action: "not_supported" };
  }
}

export default InstallmentPaymentProviderService;
