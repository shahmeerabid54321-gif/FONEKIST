import { AppError, warrantyLabel, type WarrantyType, type DurationUnit } from "@/lib/pk";
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
 * are revalidated in commerce. Listing reads are therefore cached; the PDP's purchase panel
 * and anything in the cart path are not.
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

export interface ProductListParams {
  categoryId?: string;
  limit?: number;
  offset?: number;
  order?: string;
  q?: string;
}

export async function listProducts(params: ProductListParams = {}): Promise<{
  products: MedusaProduct[];
  count: number;
}> {
  const search = new URLSearchParams({
    fields: PRODUCT_FIELDS,
    limit: String(params.limit ?? 24),
    offset: String(params.offset ?? 0),
    // Required: Medusa refuses to calculate prices without a pricing context.
    region_id: await getRegionId(),
  });
  if (params.categoryId) search.set("category_id[]", params.categoryId);
  if (params.order) search.set("order", params.order);
  if (params.q) search.set("q", params.q);

  const data = await medusaFetch<{ products: MedusaProduct[]; count: number }>(
    `/store/products?${search.toString()}`,
    // Listing data may lag briefly (ADR-014); the PDP revalidates before purchase.
    { next: { revalidate: 60, tags: ["products"] } },
  );

  return { products: data.products ?? [], count: data.count ?? 0 };
}

export async function getProductByHandle(handle: string): Promise<MedusaProduct | null> {
  const search = new URLSearchParams({
    handle,
    fields: PRODUCT_FIELDS,
    limit: "1",
    region_id: await getRegionId(),
  });

  const data = await medusaFetch<{ products: MedusaProduct[] }>(
    `/store/products?${search.toString()}`,
    // The PDP states price, stock and delivery, so it reads fresh rather than from cache.
    { cache: "no-store" },
  );

  return data.products?.[0] ?? null;
}

export interface MedusaCategory {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parent_category_id: string | null;
  category_children?: MedusaCategory[];
}

export async function listCategories(): Promise<MedusaCategory[]> {
  const data = await medusaFetch<{ product_categories: MedusaCategory[] }>(
    "/store/product-categories?fields=id,name,handle,description,parent_category_id,*category_children&limit=100",
    { next: { revalidate: 300, tags: ["categories"] } },
  );
  return data.product_categories ?? [];
}

export async function getCategoryByHandle(handle: string): Promise<MedusaCategory | null> {
  const data = await medusaFetch<{ product_categories: MedusaCategory[] }>(
    `/store/product-categories?handle=${encodeURIComponent(handle)}&fields=id,name,handle,description,parent_category_id,*category_children&limit=1`,
    { next: { revalidate: 300, tags: ["categories"] } },
  );
  return data.product_categories?.[0] ?? null;
}


/* ------------------------------------------------------------------- Region */

export interface MedusaRegion {
  id: string;
  name: string;
  currency_code: string;
}

let cachedRegionId: string | null = null;

/**
 * Resolves the pricing region.
 *
 * Medusa cannot calculate a price without one, so every catalog read passes `region_id`.
 * The store is single-region and PKR-only (multi-currency is an explicit MVP non-goal), so
 * the id is memoised per server process rather than resolved on each request.
 */
export async function getRegionId(): Promise<string> {
  if (cachedRegionId) return cachedRegionId;

  const data = await medusaFetch<{ regions: MedusaRegion[] }>(
    "/store/regions?limit=1",
    { next: { revalidate: 3600, tags: ["regions"] } },
  );

  const region = data.regions?.[0];
  if (!region) {
    throw new AppError("INTERNAL_ERROR", {
      message: "The store is not configured for your region yet.",
      internal: "No region returned by commerce. Run the seed script.",
    });
  }

  cachedRegionId = region.id;
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
export async function getProductExtras(
  productId: string,
  variantId?: string | null,
): Promise<ProductExtras> {
  const search = new URLSearchParams({ product_id: productId });
  if (variantId) search.set("variant_id", variantId);

  try {
    const data = await medusaFetch<{ data: ProductExtras }>(
      `/store/electronics/product-details?${search.toString()}`,
      { next: { revalidate: 120, tags: [`product-extras:${productId}`] } },
    );
    return data.data;
  } catch {
    // Specs are enrichment, not purchase truth. If the endpoint fails the PDP still renders
    // price, stock and delivery rather than erroring the whole page (REL-001).
    return { specs: [], warranty: null };
  }
}

export function warrantyLabelFrom(extras: ProductExtras): string {
  return extras.warranty ? warrantyLabel(extras.warranty) : "Warranty information unavailable";
}

/* ------------------------------------------------------------------- Facets */

export interface CategoryFacet {
  key: string;
  label: string;
  type: "checkbox" | "range";
  group: string | null;
  unit: string | null;
  values: { value: string; label: string; count: number; selected: boolean }[];
  min?: number;
  max?: number;
}

/**
 * Filterable attributes for a category, counted across the given result set.
 * Counts are computed from the products actually returned, so they never promise a
 * combination that yields nothing.
 */
export async function getCategoryFacets(
  categoryId: string,
  productIds: string[],
): Promise<CategoryFacet[]> {
  if (productIds.length === 0) return [];

  const search = new URLSearchParams({
    category_id: categoryId,
    product_ids: productIds.join(","),
  });

  const data = await medusaFetch<{ data: { facets: CategoryFacet[] } }>(
    `/store/electronics/facets?${search.toString()}`,
    { next: { revalidate: 120 } },
  );

  return data.data.facets;
}

/**
 * Attribute values for a set of products, used to apply spec filters.
 *
 * ADR-014 permits this to lag briefly; it is discovery data, and the PDP and checkout
 * revalidate anything that affects the purchase.
 */
export async function getProductAttributeMap(
  productIds: string[],
): Promise<Record<string, Record<string, string[]>>> {
  if (productIds.length === 0) return {};

  const data = await medusaFetch<{ data: { products: Record<string, Record<string, string[]>> } }>(
    `/store/electronics/attribute-map?product_ids=${productIds.join(",")}`,
    { next: { revalidate: 120 } },
  );

  return data.data.products;
}

/**
 * Warranty labels for a set of products, for listing cards (CUST-008).
 * Batched so a grid renders with one request rather than one per card.
 */
export async function getWarrantyLabels(productIds: string[]): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};

  const data = await medusaFetch<{ data: { labels: Record<string, string> } }>(
    `/store/electronics/warranty-labels?product_ids=${productIds.join(",")}`,
    { next: { revalidate: 300, tags: ["warranty-labels"] } },
  );

  return data.data.labels;
}

/**
 * The two or three decisive specs shown on each listing card
 * (06_DESIGN_SYSTEM.md section 13). Which specs are decisive is category-specific.
 */
export async function getCardSpecs(
  categoryId: string,
  products: { id: string; variantId: string | null }[],
): Promise<Record<string, { label: string; value: string }[]>> {
  if (products.length === 0) return {};

  const search = new URLSearchParams({
    category_id: categoryId,
    product_ids: products.map((product) => product.id).join(","),
    // Positionally aligned with product_ids so variant-scoped specs (memory, storage)
    // resolve to the variant each card actually shows.
    variant_ids: products.map((product) => product.variantId ?? "").join(","),
  });

  const data = await medusaFetch<{ data: { specs: Record<string, { label: string; value: string }[]> } }>(
    `/store/electronics/card-specs?${search.toString()}`,
    { next: { revalidate: 300 } },
  );

  return data.data.specs;
}
