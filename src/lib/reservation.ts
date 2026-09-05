import { cookies } from "next/headers";
import { AppError } from "@/lib/pk";
import { medusaFetch } from "./medusa";
import { getRegionId } from "./catalog";
import { log } from "./log";

/**
 * The reservation basket.
 *
 * **This is not a customer cart, and it must not become one.** FONEKIST sells on
 * installments only: nothing is bought on the website, so there is no cart page, no
 * checkout, no quantity control and no promotion code. What a customer builds while
 * browsing is a shortlist, and that lives in `lib/query.ts` and holds no money at all.
 *
 * What this module is: commerce takes an installment application against a Medusa cart id
 * (`POST /store/installment-applications` wants `cart_id`), because the cart is what carries
 * the variant, the region and the stock reservation. So the storefront still builds one, in
 * exactly one place, at the moment an application is submitted — see
 * `app/actions/installments.ts`. The customer never sees it and nothing renders it.
 *
 * Nothing here may be used to build a cart UI. If a page ever needs a basket of items,
 * that is a change of business model and it goes through an ADR, not through these
 * exports. The line-item mutations a cart needs (quantity, removal, promotions) were
 * deleted with the cart itself rather than left lying around.
 *
 * The cookie keeps its old name. It holds a Medusa cart id, which is what it always held,
 * and renaming it would only orphan the baskets of anybody mid-application.
 *
 * ADR-014: nothing here computes a price or decides availability. Commerce revalidates
 * every mutation and the response is the truth we render.
 */

const BASKET_COOKIE = "fk_cart_id";
const BASKET_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface BasketLineItem {
  id: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  variant_id: string;
  product_handle?: string;
  variant?: {
    id: string;
    title: string;
    sku: string | null;
    product?: { handle: string; title: string };
  };
}

export interface Basket {
  id: string;
  items: BasketLineItem[];
  subtotal: number;
  total: number;
  currency_code: string;
  region_id: string;
}

const BASKET_FIELDS = "*items,*items.variant,*items.variant.product";

export async function getBasketId(): Promise<string | null> {
  const store = await cookies();
  return store.get(BASKET_COOKIE)?.value ?? null;
}

async function setBasketId(id: string): Promise<void> {
  const store = await cookies();
  store.set(BASKET_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: BASKET_COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearBasket(): Promise<void> {
  const store = await cookies();
  store.delete(BASKET_COOKIE);
}

/** Reads the current basket, or null when there is none. Never creates one. */
export async function getBasket(): Promise<Basket | null> {
  const basketId = await getBasketId();
  if (!basketId) return null;

  try {
    const data = await medusaFetch<{ cart: Basket }>(
      `/store/carts/${basketId}?fields=${BASKET_FIELDS}`,
      { cache: "no-store" },
    );
    return data.cart;
  } catch (error) {
    const appError = AppError.from(error);
    // A basket that no longer exists (consumed by an application, or a stale cookie from a
    // reset database) must not wedge an application: drop the cookie and carry on.
    if (appError.code === "NOT_FOUND") {
      log.info("Stale basket cookie discarded", { operation: "reservation.get", basketId });
      await clearBasket();
      return null;
    }
    throw appError;
  }
}

/** Returns the existing basket, creating one only if needed. */
export async function getOrCreateBasket(): Promise<Basket> {
  const existing = await getBasket();
  if (existing) return existing;

  const data = await medusaFetch<{ cart: Basket }>("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: await getRegionId() }),
    cache: "no-store",
  });

  await setBasketId(data.cart.id);
  return data.cart;
}

/**
 * Puts a variant in the basket, so an application has something to be about.
 *
 * Commerce validates the variant and the stock; an OUT_OF_STOCK result is surfaced to the
 * caller rather than absorbed, because an application against a handset we cannot hold is
 * one the customer must be told about before they hand over a CNIC (ADR-014).
 */
export async function addLineItem(variantId: string, quantity: number): Promise<Basket> {
  const basket = await getOrCreateBasket();

  const data = await medusaFetch<{ cart: Basket }>(
    `/store/carts/${basket.id}/line-items?fields=${BASKET_FIELDS}`,
    {
      method: "POST",
      body: JSON.stringify({ variant_id: variantId, quantity }),
      cache: "no-store",
    },
  );

  return data.cart;
}
