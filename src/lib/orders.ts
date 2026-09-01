import {
  COURIER_STATES,
  deriveTrackingState,
  TRACKING_STATE_LABEL,
  TRACKING_TIMELINE,
  type CodState,
  type CourierState,
  type PaymentState,
  type TrackingState,
} from "@/lib/pk";
import { medusaFetch } from "./medusa";

/**
 * Order reads and the customer-facing status projection.
 *
 * ADR-007 / PAY-003: nothing here trusts a URL parameter to decide whether an order is
 * paid. Payment state always comes from the commerce record.
 */

export interface OrderLine {
  id: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  variant?: { id: string; title: string; sku: string | null; product?: { handle: string; title: string } };
}

export interface Order {
  id: string;
  display_id: number;
  email: string;
  currency_code: string;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  discount_total: number;
  total: number;
  created_at: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  items: OrderLine[];
  shipping_address: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    province?: string;
  } | null;
  shipping_methods: { name: string; amount: number }[];
  payment_collections?: {
    status: string;
    payments?: { id: string; provider_id: string; captured_at: string | null; canceled_at: string | null }[];
  }[];
  fulfillments?: {
    id: string;
    shipped_at: string | null;
    delivered_at: string | null;
    canceled_at: string | null;
    labels?: { tracking_number: string; tracking_url: string | null }[];
    /** Carries the canonical courier state recorded by operations (FUL-003). */
    metadata?: Record<string, unknown> | null;
  }[];
}

const ORDER_FIELDS =
  "*items,*items.variant,*items.variant.product,*shipping_methods,*shipping_address,*payment_collections,*payment_collections.payments,*fulfillments,*fulfillments.labels,+fulfillments.metadata";

export async function getOrder(orderId: string): Promise<Order | null> {
  try {
    const data = await medusaFetch<{ order: Order }>(
      `/store/orders/${orderId}?fields=${ORDER_FIELDS}`,
      { cache: "no-store" },
    );
    return data.order;
  } catch {
    return null;
  }
}

/**
 * Maps Medusa's payment status onto the canonical taxonomy
 * (07_SYSTEM_ARCHITECTURE.md section 9).
 */
export function toPaymentState(order: Order): PaymentState {
  switch (order.payment_status) {
    case "captured":
      return "captured";
    case "authorized":
      return "authorized";
    case "partially_refunded":
      return "partially_refunded";
    case "refunded":
      return "refunded";
    case "canceled":
      return "cancelled";
    case "requires_more":
    case "awaiting":
    case "not_paid":
      return "pending";
    default:
      return "pending";
  }
}

/**
 * Maps fulfilment records onto the canonical courier state (FUL-003).
 *
 * Operations records the real state on the fulfilment, because Medusa models three
 * outcomes — shipped, delivered, cancelled — and the customer timeline needs ten. When
 * that state is present it wins; the flags are the fallback for a fulfilment created
 * before anyone recorded a courier update.
 */
export function toCourierState(order: Order): CourierState | null {
  const fulfillment = order.fulfillments?.[0];
  if (!fulfillment) return null;

  const recorded = fulfillment.metadata?.courier_state;
  if (typeof recorded === "string" && (COURIER_STATES as readonly string[]).includes(recorded)) {
    return recorded as CourierState;
  }

  if (fulfillment.canceled_at) return "cancelled";
  if (fulfillment.delivered_at) return "delivered";
  if (fulfillment.shipped_at) return "in_transit";
  return "booked";
}

export function isCodOrder(order: Order): boolean {
  return (
    order.payment_collections?.some((collection) =>
      collection.payments?.some((payment) => payment.provider_id.includes("cod")),
    ) ?? false
  );
}

export interface TrackingView {
  current: TrackingState;
  label: string;
  timeline: { state: TrackingState; label: string; reached: boolean; current: boolean }[];
  trackingNumber: string | null;
  trackingUrl: string | null;
}

/**
 * Builds the customer-facing timeline. Raw carrier wording stays secondary
 * (UX spec section 10).
 */
export function buildTrackingView(order: Order, codState?: CodState | null): TrackingView {
  const paymentState = toPaymentState(order);
  const courierState = toCourierState(order);

  const current = deriveTrackingState({
    paymentState,
    codState: codState ?? (isCodOrder(order) ? "cod_pending_confirmation" : null),
    courierState,
    cancelled: order.status === "canceled",
  });

  const currentIndex = TRACKING_TIMELINE.indexOf(current);

  const fulfillment = order.fulfillments?.[0];
  const label = fulfillment?.labels?.[0] ?? null;

  // A manually booked shipment carries its tracking number in metadata rather than on a
  // label, because no courier API produced a label to attach it to (FUL-004).
  const manualTracking = {
    number:
      typeof fulfillment?.metadata?.tracking_number === "string"
        ? fulfillment.metadata.tracking_number
        : null,
    url:
      typeof fulfillment?.metadata?.tracking_url === "string"
        ? fulfillment.metadata.tracking_url
        : null,
  };

  return {
    current,
    label: TRACKING_STATE_LABEL[current],
    // A cancelled or refunded order is not on the happy path, so nothing is marked reached.
    timeline: TRACKING_TIMELINE.map((state, index) => ({
      state,
      label: TRACKING_STATE_LABEL[state],
      reached: currentIndex >= 0 && index <= currentIndex,
      current: state === current,
    })),
    trackingNumber: label?.tracking_number ?? manualTracking.number,
    trackingUrl: label?.tracking_url ?? manualTracking.url,
  };
}

export function paymentStatusCopy(order: Order): { tone: "success" | "warning" | "danger" | "info"; text: string } {
  const state = toPaymentState(order);
  const cod = isCodOrder(order);

  if (cod && state !== "captured") {
    return { tone: "info", text: "Payable in cash on delivery" };
  }

  switch (state) {
    case "captured":
      return { tone: "success", text: "Paid" };
    case "authorized":
      return { tone: "success", text: "Payment authorised" };
    case "refunded":
      return { tone: "info", text: "Refunded" };
    case "partially_refunded":
      return { tone: "info", text: "Partially refunded" };
    case "cancelled":
      return { tone: "danger", text: "Payment cancelled" };
    case "failed":
      return { tone: "danger", text: "Payment failed" };
    default:
      // Never render an unresolved payment as a failure (UX spec section 8).
      return { tone: "warning", text: "Payment confirmation pending" };
  }
}

/* ---------------------------------------------------------------- Returns */

/*
 * Re-exported so server callers keep one import site. The definitions live in a module with
 * no imports because the return form is a client component: see `lib/return-options.ts`.
 */
export { RETURN_REASONS, RETURN_RESOLUTIONS } from "./return-options";

export interface ReturnRequestInput {
  orderReference: string;
  phone: string;
  reasonCode: string;
  requestedResolution: string;
  notes?: string;
  items: { order_line_id: string; quantity: number }[];
}

/**
 * Submits a return request.
 *
 * Commerce owns eligibility — the delivery date, the window and what has already been
 * returned. The storefront asks and reports the answer; deciding here would mean a page
 * promising a return the backend then refuses.
 */
export async function requestReturn(input: ReturnRequestInput): Promise<{ return_request_id: string }> {
  const data = await medusaFetch<{ data: { return_request_id: string } }>("/store/return-requests", {
    method: "POST",
    body: JSON.stringify({
      order_reference: input.orderReference,
      phone: input.phone,
      reason_code: input.reasonCode,
      requested_resolution: input.requestedResolution,
      notes: input.notes,
      items: input.items,
    }),
    cache: "no-store",
  });

  return data.data;
}

/** Whether this order has reached a state where a return is worth offering at all. */
export function returnsMayApply(order: Order): boolean {
  return Boolean(order.fulfillments?.some((fulfillment) => fulfillment.delivered_at));
}
