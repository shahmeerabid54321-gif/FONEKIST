import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
} from "@medusajs/framework/types";
import { PK_PROVINCES, type PkProvince } from "@pk/contracts";
import { quoteDelivery } from "../../lib/delivery";

/**
 * Delivery pricing and shipment booking for Pakistan.
 *
 * This exists to remove a genuine defect: the storefront's delivery estimator quoted
 * zone-based fees from `lib/delivery.ts` while checkout charged a flat Medusa shipping
 * option, so the two could disagree. FUL-001 and the PRD's trust thesis both require the
 * quoted price to be the charged price, so both now read the same table — this provider
 * calculates the shipping method's price from `quoteDelivery`.
 *
 * Booking is *manual* until a courier is contracted (FUL-004): creating a fulfilment
 * records a shipment awaiting a staff-entered tracking number rather than pretending to
 * call an API that does not exist yet. ADR-006 keeps the swap contained here.
 */

interface Options {
  /** Shown to staff in the admin when choosing a fulfilment option. */
  displayName?: string;
}

interface OptionData {
  /** `standard` or `express`, matching the service ids in `lib/delivery.ts`. */
  service_id?: string;
}

class PkCourierFulfillmentProvider extends AbstractFulfillmentProviderService {
  static identifier = "pk-courier";

  protected readonly logger_: Logger;
  protected readonly options_: Options;

  constructor({ logger }: { logger: Logger }, options: Options) {
    super();
    this.logger_ = logger;
    this.options_ = options ?? {};
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      { id: "standard", name: "Standard delivery", service_id: "standard" },
      { id: "express", name: "Express delivery (metro cities)", service_id: "express" },
    ];
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    const serviceId = (data as OptionData).service_id;
    return serviceId === "standard" || serviceId === "express";
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Carried onto the shipping method so a fulfilment created later knows which service
    // the customer actually paid for.
    return { ...data, service_id: (optionData as OptionData).service_id };
  }

  async canCalculate(_data: CreateShippingOptionDTO): Promise<boolean> {
    return true;
  }

  /**
   * Prices the shipping method from the same zone table the storefront quotes from.
   *
   * Medusa calls this on every cart refresh, so it must be cheap and must never throw:
   * a failure here blocks checkout entirely. An address we cannot place falls back to the
   * most expensive standard rate rather than to zero — undercharging silently is a
   * merchant loss on every order, while an unexpectedly high quote is visible and can be
   * corrected before payment.
   */
  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"],
  ): Promise<CalculatedShippingOptionPrice> {
    const serviceId =
      (data as OptionData)?.service_id ?? (optionData as OptionData)?.service_id ?? "standard";

    const address = context?.shipping_address;
    const province = normalizeProvince(address?.province);
    const city = String(address?.city ?? "");

    const subtotal = (context?.items ?? []).reduce((total, item) => {
      const line = Number((item as { subtotal?: number | string }).subtotal ?? 0);
      return total + (Number.isFinite(line) ? line : 0);
    }, 0);

    if (!province) {
      this.logger_.warn(
        `[pk-courier] no serviceable province on cart ${context?.id ?? "unknown"}; using the fallback rate`,
      );
      return { calculated_amount: FALLBACK_RATE_PKR, is_calculated_price_tax_inclusive: false };
    }

    const options = quoteDelivery({
      province,
      city,
      subtotal,
      // COD eligibility is decided by the payment provider, not by the shipping price;
      // passing true here keeps this calculation about delivery cost alone.
      codEligibleByValue: true,
    });

    const option = options.find((candidate) => candidate.id === serviceId) ?? options[0];

    if (!option) {
      this.logger_.warn(
        `[pk-courier] no delivery option for ${province}/${city}; using the fallback rate`,
      );
      return { calculated_amount: FALLBACK_RATE_PKR, is_calculated_price_tax_inclusive: false };
    }

    return { calculated_amount: option.price, is_calculated_price_tax_inclusive: false };
  }

  /**
   * Records a shipment awaiting manual booking (FUL-004).
   *
   * No courier API is contracted yet. Rather than fabricate a tracking number, the
   * fulfilment is created in `pending` with `booking_mode: "manual"`, and the admin
   * prompts staff for the courier's own number. That is also the outage path a real
   * integration needs: when the courier API is down, the order still ships.
   */
  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>,
  ): Promise<CreateFulfillmentResult> {
    this.logger_.info(
      `[pk-courier] shipment queued for manual booking: order ${order?.id ?? "unknown"}, ` +
        `fulfilment ${fulfillment.id ?? "new"}, ${items.length} item(s)`,
    );

    return {
      data: {
        service_id: (data as OptionData)?.service_id ?? "standard",
        booking_mode: "manual",
        // The canonical courier state (07_SYSTEM_ARCHITECTURE.md section 11). Staff move
        // it forward from the admin; a real integration will move it from a webhook.
        courier_state: "pending",
        tracking_events: [],
        queued_at: new Date().toISOString(),
      },
      labels: [],
    };
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { ...data, courier_state: "cancelled", cancelled_at: new Date().toISOString() };
  }
}

/**
 * Used when an address cannot be placed in a zone. Deliberately the highest standard rate
 * in the table rather than a guess: see `calculatePrice`.
 */
const FALLBACK_RATE_PKR = 550;

function normalizeProvince(value: unknown): PkProvince | null {
  if (typeof value !== "string") return null;
  const match = PK_PROVINCES.find(
    (province) => province.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? null;
}

export default PkCourierFulfillmentProvider;
