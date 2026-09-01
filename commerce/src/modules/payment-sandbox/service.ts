import { AbstractPaymentProvider, BigNumber, MedusaError } from "@medusajs/framework/utils";
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
import { sandboxPsp, type SandboxPaymentState } from "./sandbox-psp";
import { SIGNATURE_HEADER, verifySignature, WebhookVerificationError } from "./signature";

export interface SandboxPaymentOptions {
  webhookSecret: string;
  apiKey: string;
  baseUrl: string;
}

type InjectedDependencies = { logger: Logger };

/** Provider vocabulary mapped onto Medusa's session statuses. */
const STATE_TO_STATUS = {
  pending: "pending",
  authorized: "authorized",
  captured: "captured",
  failed: "error",
  cancelled: "canceled",
  refunded: "captured",
} as const satisfies Record<SandboxPaymentState, string>;

/**
 * Digital payment adapter, written against a sandbox backend.
 *
 * The whole point of this class is ADR-007: the browser's return from the payment page is
 * presentation only. `authorizePayment` therefore never trusts its input — it re-reads
 * state from the provider. If the provider has not confirmed, it returns
 * `pending_authorization`, which lets the order exist in an awaiting state instead of
 * either lying that it is paid or falsely failing it.
 */
class SandboxPaymentProviderService extends AbstractPaymentProvider<SandboxPaymentOptions> {
  static identifier = "sandbox";

  protected readonly logger_: Logger;
  protected readonly options_: SandboxPaymentOptions;

  constructor(container: InjectedDependencies, options: SandboxPaymentOptions) {
    super(container, options);
    this.logger_ = container.logger;
    this.options_ = options;
  }

  static validateOptions(options: Record<string, unknown>): void {
    if (!options.webhookSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Sandbox payment provider requires a webhookSecret. Without it webhooks cannot be verified (PAY-001).",
      );
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    // Medusa does not expose the payment session id on the provider context, so the
    // caller passes it through `data` when it has one. The idempotency key is the next best
    // stable correlator; a random id is the last resort and still lets the webhook match on
    // the provider reference.
    const sessionId = String(
      (input.data as { session_id?: string } | undefined)?.session_id ??
        input.context?.idempotency_key ??
        crypto.randomUUID(),
    );
    const payment = sandboxPsp.create({
      sessionId,
      amount: Number(input.amount),
      currency: input.currency_code,
    });

    return {
      id: payment.reference,
      data: {
        provider_reference: payment.reference,
        session_id: sessionId,
        amount: payment.amount,
        currency_code: payment.currency,
        // The storefront sends the customer here. Returning from it proves nothing.
        redirect_url: `${this.options_.baseUrl}/checkout/${payment.reference}`,
        state: payment.state,
      },
    };
  }

  /**
   * ADR-007 / PAY-003. Re-reads authoritative state from the provider and ignores whatever
   * the browser claims. A tampered return URL cannot reach `authorized` here, because the
   * only input this method uses is the provider reference.
   */
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const reference = this.referenceFrom(input.data);
    const payment = sandboxPsp.get(reference);

    if (!payment) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "That payment could not be found with the provider.",
      );
    }

    switch (payment.state) {
      case "authorized":
      case "captured":
        return {
          status: payment.state === "captured" ? "captured" : "authorized",
          data: { ...input.data, state: payment.state, verified_at: new Date().toISOString() },
        };

      case "failed":
      case "cancelled":
        return { status: "error", data: { ...input.data, state: payment.state } };

      default:
        // Unknown, not failed. The customer sees "Payment confirmation pending" and the
        // webhook or the reconciliation job resolves it (UX spec section 8, PAY-002).
        return { status: "pending_authorization", data: { ...input.data, state: payment.state } };
    }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const reference = this.referenceFrom(input.data);
    const payment = sandboxPsp.transition(reference, "captured");
    return { data: { ...input.data, state: payment.state, captured_at: new Date().toISOString() } };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const reference = this.referenceFrom(input.data);
    const payment = sandboxPsp.get(reference);
    // Capturing then cancelling would silently lose money; refund is the correct path.
    if (payment?.state === "captured") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This payment is already captured and must be refunded rather than cancelled.",
      );
    }
    sandboxPsp.transition(reference, "cancelled");
    return { data: { ...input.data, state: "cancelled" } };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const data = input.data ?? {};
    const reference = (data as { provider_reference?: string }).provider_reference;
    if (reference && sandboxPsp.get(reference)?.state === "pending") {
      sandboxPsp.transition(reference, "cancelled");
    }
    return { data };
  }

  /** Used by the reconciliation job to resolve stale pending payments (PAY-002). */
  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const reference = this.referenceFrom(input.data);
    const payment = sandboxPsp.get(reference);
    if (!payment) return { status: "error", data: input.data };
    return {
      status: STATE_TO_STATUS[payment.state] as GetPaymentStatusOutput["status"],
      data: { ...input.data, state: payment.state },
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const reference = this.referenceFrom(input.data);
    const payment = sandboxPsp.refund(reference, Number(input.amount));
    return {
      data: {
        ...input.data,
        state: payment.state,
        refunded_amount: payment.refundedAmount,
        refunded_at: new Date().toISOString(),
      },
    };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const reference = this.referenceFrom(input.data);
    const payment = sandboxPsp.get(reference);
    return { data: payment ? { ...payment } : (input.data ?? {}) };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // The provider fixes the amount at session creation, so a changed cart total means a
    // fresh session rather than an edited one.
    const reference = this.referenceFrom(input.data);
    const existing = sandboxPsp.get(reference);
    if (existing && Number(input.amount) !== existing.amount) {
      return await this.initiatePayment(input as unknown as InitiatePaymentInput);
    }
    return { data: input.data ?? {} };
  }

  /**
   * Webhook handling. Implements API contract section 7 steps 1-6: raw body, signature,
   * replay window, parse, and amount/currency validation. Deduplication by event id and the
   * state transition itself happen in the route, which owns the idempotency store.
   *
   * An invalid signature returns `failed` without any session id, so nothing is mutated
   * (PAY-001).
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const rawBody =
      typeof payload.rawData === "string" ? payload.rawData : payload.rawData?.toString("utf8") ?? "";
    const headers = (payload.headers ?? {}) as Record<string, string | undefined>;

    try {
      verifySignature({
        secret: this.options_.webhookSecret,
        rawBody,
        header: headers[SIGNATURE_HEADER] ?? headers[SIGNATURE_HEADER.toLowerCase()],
      });
    } catch (error) {
      const reason = error instanceof WebhookVerificationError ? error.reason : "unknown";
      // Logged as a security event: a bad signature is either a bug or an attack.
      this.logger_.warn(`[payment-sandbox] rejected webhook, ${reason}`);
      return { action: "not_supported" };
    }

    const event = JSON.parse(rawBody) as {
      event_type?: string;
      reference?: string;
      session_id?: string;
      amount?: number;
      currency?: string;
    };

    if (!event.reference || !event.session_id) return { action: "not_supported" };

    // Amount and currency are validated against the provider's own record rather than
    // trusted from the webhook body (API contract section 7 step 6).
    const payment = sandboxPsp.get(event.reference);
    if (!payment) return { action: "not_supported" };
    if (event.amount !== undefined && Number(event.amount) !== payment.amount) {
      this.logger_.error(
        `[payment-sandbox] webhook amount mismatch for ${event.reference}; ignoring event`,
      );
      return { action: "not_supported" };
    }

    const amount = new BigNumber(payment.amount);

    switch (event.event_type) {
      case "payment.authorized":
        return { action: "authorized", data: { session_id: event.session_id, amount } };
      case "payment.captured":
        return { action: "captured", data: { session_id: event.session_id, amount } };
      case "payment.failed":
        return { action: "failed", data: { session_id: event.session_id, amount } };
      default:
        return { action: "not_supported" };
    }
  }

  private referenceFrom(data: Record<string, unknown> | undefined): string {
    const reference = (data as { provider_reference?: string } | undefined)?.provider_reference;
    if (!reference) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Payment data is missing its provider reference.",
      );
    }
    return reference;
  }
}

export default SandboxPaymentProviderService;
