import { cacheLife, cacheTag } from "next/cache";
import { AppError, type WarrantyType, type DurationUnit } from "@/lib/pk";
import { medusaFetch } from "./medusa";

/**
 * How stock is described to a customer.
 *
 * Declared here rather than imported: FONEKIST does not vendor `@pk/ui` (ADR-022), and this
 * union is the contract between `stockLevelFor` and whatever renders it.
 */
export type StockLevel = "in_stock" | "low_stock" | "out_of_stock" | "preorder";

/**
 * Catalog read model for the storefront.
 *
 * ADR-014: search and listing data may be briefly stale, but price, inventory and payment
 * are revalidated in commerce.
 *
 * **What is cached, and why an hour.** Every read here is a `use cache` scope on an hourly
 * profile. That is a deliberate widening: the PDP used to read `no-store` on the reasoning
 * that it states price and stock. The cost of that was one uncached backend round trip per
 * product view, which is what made the site unusable under any real traffic.
 *
 * The reasoning survives the change because an hour-old *presented* figure is not a
 * *decided* one. Commerce is still the only thing that decides: `actions/installments.ts`
 * re-reads authoritative price and stock when an application is submitted, and that path is
 * deliberately uncached. What a customer browses is a catalogue; what they agree to is
 * revalidated at the moment they agree to it.
 *
 * The one figure that may not lag is stock. "Only N left" an hour after N was true is
 * manufactured scarcity, which CLAUDE.md forbids outright, so the PDP reads live inventory
 * in its own Suspense boundary rather than taking it from this cache.
 *
 * Nothing here filters for phones. It does not have to: every request carries the FONEKIST
 * publishable key, and the FONEKIST sales channel contains only phones (ADR-022). A
 * category filter in this file would be a second, weaker copy of that rule, and the two
 * would eventually disagree.
 */

export interface MedusaPrice {
  calculated_amount: number;
  original_amount: number | null;
  currency_code: string;
}

export interface MedusaVariant {
  id: string;
  title: string;
  sku: string | null;
  options: { id: string; value: string; option_id: string }[];
  calculated_price?: MedusaPrice | null;
  inventory_quantity?: number | null;
  manage_inventory?: boolean;
  allow_backorder?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface MedusaProduct {
  id: string;
  title: string;
  subtitle: string | null;
  handle: string;
  description: string | null;
  thumbnail: string | null;
  images: { id: string; url: string }[];
  options: { id: string; title: string; values: { id: string; value: string }[] }[];
  variants: MedusaVariant[];
  categories: { id: string; name: string; handle: string }[];
  metadata: Record<string, unknown> | null;
}

/** Below this many units we say "Only N left" — a real number, never manufactured urgency. */
const LOW_STOCK_THRESHOLD = 5;

export function stockLevelFor(variant: MedusaVariant): {
  level: StockLevel;
  quantity: number | null;
} {
  // A variant that does not manage inventory is always sellable; there is nothing to count.
  if (variant.manage_inventory === false) return { level: "in_stock", quantity: null };

  const quantity = variant.inventory_quantity ?? 0;
  if (quantity <= 0) {
    return { level: variant.allow_backorder ? "preorder" : "out_of_stock", quantity: 0 };
  }
  if (quantity <= LOW_STOCK_THRESHOLD) return { level: "low_stock", quantity };
  return { level: "in_stock", quantity };
}

export function priceFor(variant: MedusaVariant): { amount: number; compareAt: number | null } {
  const amount = variant.calculated_price?.calculated_amount ?? 0;
  const original = variant.calculated_price?.original_amount ?? null;

  // A compare-at is shown only when it is genuinely higher (PRD section 8: no fake
  // discount perception). Prefer the pricing engine's original amount, then the explicit
  // compare-at recorded on the variant.
  const metadataCompareAt = Number(variant.metadata?.compare_at_pkr ?? 0) || null;
  const candidate = original && original > amount ? original : metadataCompareAt;

  return { amount, compareAt: candidate && candidate > amount ? candidate : null };
}

/** Picks the variant a PDP should show first: the cheapest one actually in stock. */
export function defaultVariant(product: MedusaProduct): MedusaVariant | undefined {
  const inStock = product.variants.filter((v) => stockLevelFor(v).level !== "out_of_stock");
  const pool = inStock.length > 0 ? inStock : product.variants;
  return [...pool].sort((a, b) => priceFor(a).amount - priceFor(b).amount)[0];
}

export function brandOf(product: MedusaProduct): string | null {
  const brand = product.metadata?.brand;
  return typeof brand === "string" ? brand : null;
}

export function modelOf(product: MedusaProduct): string | null {
  const model = product.metadata?.model;
  return typeof model === "string" ? model : null;
}

export function boxContentsOf(product: MedusaProduct): string[] {
  const contents = product.metadata?.box_contents;
  return Array.isArray(contents) ? contents.map(String) : [];
}

const PRODUCT_FIELDS =
  "*variants.calculated_price,*variants.options,*options.values,*categories,*images,+variants.inventory_quantity,+metadata,+variants.metadata";

/**
 * One product, by handle.
 *
 * Cached for an hour and tagged per handle, so correcting a single product upstream can
 * expire that one entry rather than the whole catalogue. See the note at the top of this
 * file for why a cached PDP is compatible with commerce owning the price: the figures here
 * are presented, not decided, and the application path re-reads them uncached.
 */
export async function getProductByHandle(handle: string): Promise<MedusaProduct | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`product:${handle}`);

  // Awaited before the constructor rather than inside it. It reads the same either way, but
  // as an argument it hid a second, serial round trip in the middle of building a query
  // string, which is the last place anyone looks for one.
  const regionId = await getRegionId();

  const search = new URLSearchParams({
    handle,
    fields: PRODUCT_FIELDS,
    limit: "1",
    region_id: regionId,
  });

  const data = await medusaFetch<{ products: MedusaProduct[] }>(
    `/store/products?${search.toString()}`,
  );

  return data.products?.[0] ?? null;
}

/**
 * Live inventory for one variant, deliberately uncached.
 *
 * This exists because `getProductByHandle` is now cached for an hour, and one figure on the
 * product page may not be an hour old: "Only 3 left". CLAUDE.md forbids fabricated scarcity
 * outright, and a count that was true at some point in the last hour, printed as though it
 * were true now, is exactly that. Everything else on the page tolerates the hour; this does
 * not, so it is read separately, on every request, inside its own Suspense boundary.
 *
 * It returns `null` rather than throwing when commerce cannot be reached. The caller shows
 * the cached availability *level* in that case, which is a weaker claim ("In stock") and
 * one we are still willing to stand behind, rather than a number we cannot support.
 *
 * **Thirty seconds, not zero.** Reading commerce on literally every request put a backend
 * round trip on the critical path of every product view and held the page to about 70
 * requests a second. The `seconds` profile refreshes in the background every second and
 * expires after a minute, so the count on screen is at most a few seconds old. That is a
 * real count, which is the requirement; the rule forbids inventing scarcity, not caching a
 * number briefly. It stays out of the static shell either way, because the profile is short
 * enough that Next excludes it from prerenders, which is exactly what we want.
 */
export async function getLiveStock(
  handle: string,
  variantId: string,
): Promise<{ level: StockLevel; quantity: number | null } | null> {
  try {
    return await fetchLiveStock(handle, variantId);
  } catch {
    return null;
  }
}

async function fetchLiveStock(
  handle: string,
  variantId: string,
): Promise<{ level: StockLevel; quantity: number | null } | null> {
  "use cache";
  cacheLife("seconds");
  cacheTag(`stock:${handle}`);

  const regionId = await getRegionId();
  const search = new URLSearchParams({
    handle,
    fields: PRODUCT_FIELDS,
    limit: "1",
    region_id: regionId,
  });

  const data = await medusaFetch<{ products: MedusaProduct[] }>(
    `/store/products?${search.toString()}`,
  );

  const variant = data.products?.[0]?.variants.find((candidate) => candidate.id === variantId);
  return variant ? stockLevelFor(variant) : null;
}

export interface MedusaCategory {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parent_category_id: string | null;
  category_children?: MedusaCategory[];
}

/**
 * Every category, which is also every brand (ADR-026).
 *
 * The hottest read on the site by a distance: the header and the footer both render the
 * brand list on every route. Cached, it belongs to the prerendered shell and costs nothing;
 * uncached, it was the first thing every page in the site waited for.
 */
export async function listCategories(): Promise<MedusaCategory[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");

  const data = await medusaFetch<{ product_categories: MedusaCategory[] }>(
    "/store/product-categories?fields=id,name,handle,description,parent_category_id,*category_children&limit=100",
  );
  return data.product_categories ?? [];
}


/* ------------------------------------------------------------------- Region */

export interface MedusaRegion {
  id: string;
  name: string;
  currency_code: string;
}

/**
 * Resolves the pricing region.
 *
 * Medusa cannot calculate a price without one, so every catalog read passes `region_id`.
 * The store is single-region and PKR-only (multi-currency is an explicit MVP non-goal).
 *
 * This was a module-level `let`, which memoised it per process and therefore per worker,
 * per restart and per deploy: on a cold process the first product read paid two serial round
 * trips instead of one. `use cache` on the longest profile is the same idea done once for
 * the whole application rather than once per process.
 *
 * A missing region still throws. Next does not cache a thrown error, so a backend that is
 * merely unseeded does not poison the entry for a month.
 */
export async function getRegionId(): Promise<string> {
  "use cache";
  cacheLife("max");
  cacheTag("regions");

  const data = await medusaFetch<{ regions: MedusaRegion[] }>("/store/regions?limit=1");

  const region = data.regions?.[0];
  if (!region) {
    throw new AppError("INTERNAL_ERROR", {
      message: "The store is not configured for your region yet.",
      internal: "No region returned by commerce. Run the seed script.",
    });
  }

  return region.id;
}

/* ---------------------------------------------------------------- Specs & warranty */

export interface RenderedSpec {
  key: string;
  label: string;
  value: string;
  group: string | null;
  groupOrder: number;
  comparable: boolean;
}

export interface ProductExtras {
  specs: RenderedSpec[];
  warranty: {
    label: string;
    type: WarrantyType;
    provider_name: string | null;
    duration_value: number;
    duration_unit: DurationUnit;
    coverage_summary: string;
    claim_instructions: string;
    terms_reference: string | null;
  } | null;
}

/**
 * Specs and warranty come from the custom commerce endpoint rather than being derived in
 * the storefront, so the PDP and the admin agree on exactly one rendering of a value.
 */
async function fetchProductExtras(
  productId: string,
  variantId: string | null,
): Promise<ProductExtras> {
  "use cache";
  cacheLife("hours");
  cacheTag(`product-extras:${productId}`);

  const search = new URLSearchParams({ product_id: productId });
  if (variantId) search.set("variant_id", variantId);

  const data = await medusaFetch<{ data: ProductExtras }>(
    `/store/electronics/product-details?${search.toString()}`,
  );
  return data.data;
}

/**
 * The fallback lives outside the cache on purpose.
 *
 * If the try/catch were inside the `use cache` scope, a single transient failure would be
 * cached as "this product has no specs" and every visitor would see that for the next hour.
 * Out here, a failure is just a failure: nothing is written, and the next request tries
 * again.
 */
export async function getProductExtras(
  productId: string,
  variantId?: string | null,
): Promise<ProductExtras> {
  try {
    return await fetchProductExtras(productId, variantId ?? null);
  } catch {
    // Specs are enrichment, not purchase truth. If the endpoint fails the PDP still renders
    // price, stock and delivery rather than erroring the whole page (REL-001).
    return { specs: [], warranty: null };
  }
}
