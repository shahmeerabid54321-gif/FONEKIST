import { randomUUID } from "node:crypto";
import { AppError, IDEMPOTENCY_KEY_HEADER, type Address } from "@/lib/pk";
import { medusaFetch } from "./medusa";
import type { Cart } from "./cart";

/**
 * Checkout operations.
 *
 * ADR-008: guest checkout is the default and account creation never blocks it — nothing
 * here requires a customer session.
 *
 * ADR-007: completing a cart never marks an order paid. For an online provider the
 * customer is sent to the provider surface and the order becomes paid only when a verified
 * webhook or a status reconciliation says so.
 */

const CART_FIELDS =
  "*items,*items.variant,*items.variant.product,*shipping_methods,*payment_collection,*payment_collection.payment_sessions,*promotions";

export interface ShippingOption {
  id: string;
  name: string;
  amount: number;
  price_type: string;
  /** Carries the zone service id the `pk-courier` provider prices from. */
  data?: Record<string, unknown> | null;
}

export async function setContactAndAddress(
  cartId: string,
  input: { email: string; address: Address },
): Promise<Cart> {
  const shipping = {
    first_name: input.address.full_name.split(" ")[0] ?? input.address.full_name,
    last_name: input.address.full_name.split(" ").slice(1).join(" ") || "-",
    phone: input.address.phone,
    address_1: input.address.street,
    // Area and landmark are meaningful in Pakistani addressing and would otherwise be lost:
    // couriers rely on them far more than on a postal code.
    address_2: [input.address.area, input.address.landmark].filter(Boolean).join(", "),
    city: input.address.city,
    province: input.address.province,
    country_code: "pk",
  };

  const data = await medusaFetch<{ cart: Cart }>(`/store/carts/${cartId}?fields=${CART_FIELDS}`, {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      shipping_address: shipping,
      billing_address: shipping,
    }),
    cache: "no-store",
  });

  return data.cart;
}

export async function listShippingOptions(cartId: string): Promise<ShippingOption[]> {
  const data = await medusaFetch<{ shipping_options: ShippingOption[] }>(
    `/store/shipping-options?cart_id=${cartId}`,
    { cache: "no-store" },
  );
  return data.shipping_options ?? [];
}

export async function setShippingMethod(cartId: string, optionId: string): Promise<Cart> {
  const data = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cartId}/shipping-methods?fields=${CART_FIELDS}`,
    { method: "POST", body: JSON.stringify({ option_id: optionId }), cache: "no-store" },
  );
  return data.cart;
}

export interface PaymentProviderOption {
  id: string;
  is_enabled: boolean;
}

export async function listPaymentProviders(regionId: string): Promise<PaymentProviderOption[]> {
  const data = await medusaFetch<{ payment_providers: PaymentProviderOption[] }>(
    `/store/payment-providers?region_id=${regionId}`,
    { cache: "no-store" },
  );
  return data.payment_providers ?? [];
}

/**
 * Creates the payment session. TRD section 7 lists this as a duplicate-risk write, so it
 * carries an idempotency key: a double-submitted checkout must not open two sessions with
 * the provider.
 */
export async function createPaymentSession(
  cart: Cart,
  providerId: string,
  idempotencyKey: string,
): Promise<Cart> {
  await medusaFetch(`/store/payment-collections`, {
    method: "POST",
    body: JSON.stringify({ cart_id: cart.id }),
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    cache: "no-store",
  }).catch((error) => {
    // A collection already existing is the normal case on a retry or a changed method.
    if (AppError.from(error).code !== "CONFLICT") throw error;
  });

  const refreshed = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cart.id}?fields=${CART_FIELDS}`,
    { cache: "no-store" },
  );

  const collectionId = refreshed.cart.payment_collection?.id;
  if (!collectionId) {
    throw new AppError("INTERNAL_ERROR", {
      message: "We could not start the payment for this order.",
      internal: { cartId: cart.id, providerId },
    });
  }

  await medusaFetch(`/store/payment-collections/${collectionId}/payment-sessions`, {
    method: "POST",
    body: JSON.stringify({ provider_id: providerId }),
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    cache: "no-store",
  });

  const final = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cart.id}?fields=${CART_FIELDS}`,
    { cache: "no-store" },
  );
  return final.cart;
}

export interface CompletedOrder {
  id: string;
  display_id: number;
  email: string;
  currency_code: string;
  total: number;
  payment_status?: string;
  fulfillment_status?: string;
  status?: string;
  items: { id: string; title: string; quantity: number; unit_price: number; total: number }[];
  shipping_address: Record<string, unknown> | null;
  shipping_methods: { name: string; amount: number }[];
}

export type CompleteResult =
  | { kind: "order"; order: CompletedOrder }
  | { kind: "pending"; cart: Cart };

/**
 * Completes the cart.
 *
 * The idempotency key is mandatory (TRD section 7, CUST-016): a customer who taps the
 * button twice, or whose connection retries, must end up with exactly one order.
 *
 * A `cart` response rather than an `order` response means the payment is not resolved yet.
 * That is reported as pending, never as failure — showing "payment failed" for a payment
 * that later succeeds is the worst outcome for both customer and merchant.
 */
export async function completeCart(cartId: string, idempotencyKey: string): Promise<CompleteResult> {
  const data = await medusaFetch<{ type: string; order?: CompletedOrder; cart?: Cart; error?: unknown }>(
    `/store/carts/${cartId}/complete`,
    {
      method: "POST",
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      cache: "no-store",
      // Completion can be slower than a normal read: it validates stock and prices and
      // talks to the payment provider.
      timeoutMs: 20_000,
    },
  );

  if (data.type === "order" && data.order) return { kind: "order", order: data.order };
  if (data.cart) return { kind: "pending", cart: data.cart };

  throw new AppError("PAYMENT_PENDING", { internal: data });
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

export interface DeliveryQuoteOption {
  id: string;
  label: string;
  price: number;
  currency: "PKR";
  eta_min_days: number;
  eta_max_days: number;
  cod_available: boolean;
  exceptions: string[];
}

/**
 * The zone quote for a cart's saved address.
 *
 * This is the same table the `pk-courier` fulfilment provider prices from, so a quote and
 * a charge agree by construction rather than by coincidence (FUL-001). What the quote adds
 * on top of the price is the part Medusa has no model for: which services a zone actually
 * runs, the ETA range, whether COD is offered there, and the operational caveats.
 */
export async function quoteDeliveryForCart(
  cartId: string,
  address: { province?: unknown; city?: unknown; area?: unknown } | null,
): Promise<DeliveryQuoteOption[]> {
  const province = typeof address?.province === "string" ? address.province : "";
  const city = typeof address?.city === "string" ? address.city : "";
  if (!province || city.length < 2) return [];

  const query = new URLSearchParams({ cart_id: cartId, province, city });

  const data = await medusaFetch<{ data: { options: DeliveryQuoteOption[] } }>(
    `/store/delivery/quote?${query.toString()}`,
    // Purchase-critical: this decides what the customer is told they will pay.
    { cache: "no-store" },
  );

  return data.data.options;
}

/* ------------------------------------------------------- COD confirmation */

export interface CodVerificationStatus {
  required: boolean;
  verified: boolean;
  threshold_pkr: number;
}

/**
 * Whether this cart needs a phone confirmation before a COD order can be placed.
 *
 * PAY-005 and 08_DATA_MODEL.md section 12. The threshold is a merchant setting held in
 * commerce; the storefront asks rather than keeping its own copy.
 */
export async function getCodVerificationStatus(cartId: string): Promise<CodVerificationStatus> {
  const data = await medusaFetch<{ data: CodVerificationStatus }>(
    `/store/cod/verify/status?cart_id=${encodeURIComponent(cartId)}`,
    { cache: "no-store" },
  );
  return data.data;
}

export interface CodChallenge {
  required: boolean;
  challenge_id?: string;
  masked_destination?: string;
  expires_at?: string;
  attempts_remaining?: number;
}

export async function startCodVerification(cartId: string, phone: string): Promise<CodChallenge> {
  const data = await medusaFetch<{ data: CodChallenge }>("/store/cod/verify/start", {
    method: "POST",
    body: JSON.stringify({ cart_id: cartId, phone }),
    cache: "no-store",
  });
  return data.data;
}

export async function completeCodVerification(
  challengeId: string,
  code: string,
): Promise<{ verified: boolean; attempts_remaining: number; expired: boolean }> {
  const data = await medusaFetch<{
    data: { verified: boolean; attempts_remaining: number; expired: boolean };
  }>("/store/cod/verify/complete", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId, code }),
    cache: "no-store",
  });
  return data.data;
}
