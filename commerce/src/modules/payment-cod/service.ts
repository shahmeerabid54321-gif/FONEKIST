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

export interface CodOptions {
  /** Merchant-configurable ceiling for COD orders (PAY-005, TRD section 14). */
  maxOrderValuePkr: number;
}

type InjectedDependencies = { logger: Logger };

/**
 * Cash on delivery.
 *
 * COD has no third-party provider, so most methods are local state transitions. The
 * important behaviour is what it deliberately does NOT do:
 *
 *  - `authorizePayment` returns `authorized`, never `captured`. The order is placed but no
 *    money has moved. Cash is captured when the courier actually collects it, which is an
 *    explicit admin/courier action, not a side effect of checkout.
 *  - Eligibility is enforced here, server-side, at session creation. A browser that hides
 *    the COD option is not a control (architecture section 15: the browser is untrusted).
 */
class CodPaymentProviderService extends AbstractPaymentProvider<CodOptions> {
  static identifier = "cod";

  protected readonly logger_: Logger;
  protected readonly options_: CodOptions;

  constructor(container: InjectedDependencies, options: CodOptions) {
    super(container, options);
    this.logger_ = container.logger;
    this.options_ = options;
  }

  static validateOptions(options: Record<string, unknown>): void {
    const max = Number(options.maxOrderValuePkr);
    if (!Number.isFinite(max) || max <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "COD provider requires a positive maxOrderValuePkr.",
      );
    }
  }

  /**
   * Creates the COD "session". Enforces the value ceiling — the one rule that actually
   * matters here, since an over-limit COD order is the merchant's direct financial risk.
   */
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const amount = Number(input.amount);

    if (amount > this.options_.maxOrderValuePkr) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cash on delivery is available for orders up to Rs ${this.options_.maxOrderValuePkr.toLocaleString("en-PK")}. Please choose another payment method.`,
      );
    }

    const reference = `cod_${input.context?.idempotency_key ?? crypto.randomUUID()}`;

    return {
      id: reference,
      data: {
        reference,
        amount,
        currency_code: input.currency_code,
        // Every COD order starts unverified. Confirmation is a separate operational step
        // (07_SYSTEM_ARCHITECTURE.md section 10).
        cod_state: "cod_pending_confirmation",
        collected: false,
      },
    };
  }

  /**
   * Places the order without moving money. Returns `authorized`, not `captured`: nothing
   * has been collected yet and reporting it as captured would make revenue figures wrong.
   */
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return { status: "authorized", data: { ...input.data, authorized_at: new Date().toISOString() } };
  }

  /**
   * Records cash actually collected on delivery. Triggered by staff or by a courier
   * `delivered` event — never automatically at checkout.
   */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return {
      data: {
        ...input.data,
        collected: true,
        cod_state: "cod_collected",
        captured_at: new Date().toISOString(),
      },
    };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: { ...input.data, cod_state: "cod_rejected", cancelled_at: new Date().toISOString() } };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as { collected?: boolean; cod_state?: string };
    if (data.cod_state === "cod_rejected") return { status: "canceled", data: input.data };
    if (data.collected) return { status: "captured", data: input.data };
    return { status: "authorized", data: input.data };
  }

  /**
   * A COD refund is an offline cash movement. It is recorded so commerce and the books
   * agree, but this provider cannot move money on its own (PAY-004).
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as { collected?: boolean };
    if (!data.collected) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This COD order has no collected cash to refund. Cancel the order instead.",
      );
    }
    return {
      data: {
        ...input.data,
        refunded_amount: Number(input.amount),
        refund_method: "manual_cash",
        refunded_at: new Date().toISOString(),
      },
    };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const amount = Number(input.amount);
    // The ceiling is re-checked on update: a cart edited above the limit after the COD
    // session was created must not slip through.
    if (amount > this.options_.maxOrderValuePkr) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cash on delivery is available for orders up to Rs ${this.options_.maxOrderValuePkr.toLocaleString("en-PK")}.`,
      );
    }
    return { data: { ...input.data, amount } };
  }

  /** COD has no provider and therefore no webhook. */
  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    return { action: "not_supported" };
  }
}

export default CodPaymentProviderService;
