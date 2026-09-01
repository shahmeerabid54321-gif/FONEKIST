import { cookies } from "next/headers";
import { AppError } from "@/lib/pk";
import { medusaFetch } from "./medusa";
import { getRegionId } from "./catalog";
import { log } from "./log";

/**
 * Cart access.
 *
 * CUST-012: an anonymous cart persists across refresh and return visits. The cart id lives
 * in an httpOnly cookie — it is a capability, so it must not be readable by client script.
 *
 * ADR-014: nothing here computes a price or decides availability. Every mutation goes to
 * commerce, which revalidates, and the response is the truth we render.
 */

const CART_COOKIE = "fk_cart_id";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface CartLineItem {
  id: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  variant_id: string;
  product_handle?: string;
  variant?: { id: string; title: string; sku: string | null; product?: { handle: string; title: string } };
}

export interface Cart {
  id: string;
  items: CartLineItem[];
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  discount_total: number;
  total: number;
  currency_code: string;
  region_id: string;
  email: string | null;
  shipping_address: Record<string, unknown> | null;
  shipping_methods: { id: string; name: string; amount: number }[];
  payment_collection: { id: string; payment_sessions?: { id: string; provider_id: string; status: string; data: Record<string, unknown> }[] } | null;
  promotions?: { code: string }[];
}

const CART_FIELDS =
  "*items,*items.variant,*items.variant.product,*shipping_methods,*payment_collection,*payment_collection.payment_sessions,*promotions";

export async function getCartId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

async function setCartId(id: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CART_COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearCartId(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}

/** Reads the current cart, or null when there is none. Never creates one. */
export async function getCart(): Promise<Cart | null> {
  const cartId = await getCartId();
  if (!cartId) return null;

  try {
    const data = await medusaFetch<{ cart: Cart }>(
      `/store/carts/${cartId}?fields=${CART_FIELDS}`,
      { cache: "no-store" },
    );
    return data.cart;
  } catch (error) {
    const appError = AppError.from(error);
    // A cart that no longer exists (completed, or a stale cookie from a reset database)
    // must not wedge the storefront: drop the cookie and carry on with no cart.
    if (appError.code === "NOT_FOUND") {
      log.info("Stale cart cookie discarded", { operation: "cart.get", cartId });
      await clearCartId();
      return null;
    }
    throw appError;
  }
}

/** Returns the existing cart, creating one only if needed. */
export async function getOrCreateCart(): Promise<Cart> {
  const existing = await getCart();
  if (existing) return existing;

  const data = await medusaFetch<{ cart: Cart }>("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: await getRegionId() }),
    cache: "no-store",
  });

  await setCartId(data.cart.id);
  return data.cart;
}

/**
 * Adds a variant to the cart.
 *
 * Commerce validates the variant, the quantity and the price; an OUT_OF_STOCK or
 * PRICE_CHANGED result is surfaced to the caller rather than absorbed, because the
 * customer must see it before they can buy (CUST-009, ADR-014).
 */
export async function addLineItem(variantId: string, quantity: number): Promise<Cart> {
  const cart = await getOrCreateCart();

  const data = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cart.id}/line-items?fields=${CART_FIELDS}`,
    {
      method: "POST",
      body: JSON.stringify({ variant_id: variantId, quantity }),
      cache: "no-store",
    },
  );

  return data.cart;
}

export async function updateLineItem(lineId: string, quantity: number): Promise<Cart> {
  const cartId = await getCartId();
  if (!cartId) throw new AppError("NOT_FOUND", { message: "Your cart is empty." });

  if (quantity <= 0) return await removeLineItem(lineId);

  const data = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cartId}/line-items/${lineId}?fields=${CART_FIELDS}`,
    { method: "POST", body: JSON.stringify({ quantity }), cache: "no-store" },
  );

  return data.cart;
}

export async function removeLineItem(lineId: string): Promise<Cart> {
  const cartId = await getCartId();
  if (!cartId) throw new AppError("NOT_FOUND", { message: "Your cart is empty." });

  await medusaFetch(`/store/carts/${cartId}/line-items/${lineId}`, {
    method: "DELETE",
    cache: "no-store",
  });

  const data = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cartId}?fields=${CART_FIELDS}`,
    { cache: "no-store" },
  );
  return data.cart;
}

export function cartItemCount(cart: Cart | null): number {
  return cart?.items?.reduce((total, item) => total + item.quantity, 0) ?? 0;
}

/* ------------------------------------------------------------- Promotions */

/**
 * Applies a promotion code.
 *
 * Commerce decides whether the code exists, whether it applies to this cart and what it is
 * worth. The storefront never computes a discount — a page that worked out its own saving
 * would eventually show one the backend refuses to honour (ADR-014).
 */
export async function applyPromotion(code: string): Promise<Cart> {
  const cartId = await getCartId();
  if (!cartId) throw new AppError("NOT_FOUND", { message: "Your cart is empty." });

  const data = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cartId}?fields=${CART_FIELDS}`,
    {
      method: "POST",
      body: JSON.stringify({ promo_codes: [code] }),
      cache: "no-store",
    },
  );

  return data.cart;
}

export async function removePromotion(code: string): Promise<Cart> {
  const cartId = await getCartId();
  if (!cartId) throw new AppError("NOT_FOUND", { message: "Your cart is empty." });

  await medusaFetch(`/store/carts/${cartId}/promotions`, {
    method: "DELETE",
    body: JSON.stringify({ promo_codes: [code] }),
    cache: "no-store",
  });

  const data = await medusaFetch<{ cart: Cart }>(
    `/store/carts/${cartId}?fields=${CART_FIELDS}`,
    { cache: "no-store" },
  );
  return data.cart;
}
