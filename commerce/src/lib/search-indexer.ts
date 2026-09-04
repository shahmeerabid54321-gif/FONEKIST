import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { brandHandle, warrantyLabel, type SearchDocumentInput } from "@pk/contracts";
import { ELECTRONICS_ATTRIBUTES_MODULE } from "../modules/electronics-attributes";
import type ElectronicsAttributesService from "../modules/electronics-attributes/service";
import { WARRANTY_MODULE } from "../modules/warranty";
import type WarrantyService from "../modules/warranty/service";
import { INSTALLMENTS_MODULE } from "../modules/installments";
import type InstallmentsService from "../modules/installments/service";
import { SEARCH_MODULE } from "../modules/search";
import type SearchIndexService from "../modules/search/service";
import { pkrPriceOf } from "./variant-price";
import { projectAttributeValues, type TypedAttributeValue } from "./attribute-projection";

/**
 * Builds the derived search index from the authoritative modules.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 7 requires incremental updates, on-demand
 * reconciliation and a full rebuild, over public fields only. This module is the
 * "normalize public search document" step of that diagram.
 *
 * It lives in the application rather than inside the search module on purpose: composing
 * a projection needs to read Product, Pricing, Inventory, attributes and warranty, and a
 * module that reached across all of those would no longer be a module (ADR-005).
 */

/** Cards say "Only N left" below this; the index only needs the boolean. */
const CARD_SPEC_LIMIT = 3;

interface GraphProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  thumbnail: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  categories: { id: string; handle: string; name: string }[];
  sales_channels: { id: string }[];
  variants: {
    id: string;
    sku: string | null;
    manage_inventory: boolean;
    allow_backorder: boolean;
    metadata: Record<string, unknown> | null;
    prices: { amount: number; currency_code: string }[];
    inventory_items: {
      inventory: { location_levels: { stocked_quantity: number; reserved_quantity: number }[] } | null;
    }[];
  }[];
}

const PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "status",
  "thumbnail",
  "created_at",
  "metadata",
  "sales_channels.id",
  "categories.id",
  "categories.handle",
  "categories.name",
  "variants.id",
  "variants.sku",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.metadata",
  "variants.prices.amount",
  "variants.prices.currency_code",
  "variants.inventory_items.inventory.location_levels.stocked_quantity",
  "variants.inventory_items.inventory.location_levels.reserved_quantity",
];

function availableQuantity(variant: GraphProduct["variants"][number]): number | null {
  if (!variant.manage_inventory) return null;

  return variant.inventory_items.reduce((total, item) => {
    const levels = item.inventory?.location_levels ?? [];
    return (
      total +
      levels.reduce(
        (sum, level) => sum + Math.max(0, level.stocked_quantity - level.reserved_quantity),
        0,
      )
    );
  }, 0);
}

/**
 * The variant a listing card shows: the cheapest one actually in stock.
 *
 * This mirrors the storefront's `defaultVariant` deliberately. If the index picked a
 * different variant, a card would advertise one price and the PDP would open on another —
 * exactly the kind of quiet inconsistency that erodes trust in a price.
 */
function cardVariant(product: GraphProduct): GraphProduct["variants"][number] | undefined {
  const sellable = product.variants.filter((variant) => {
    const quantity = availableQuantity(variant);
    return quantity === null || quantity > 0 || variant.allow_backorder;
  });
  const pool = sellable.length > 0 ? sellable : product.variants;
  return [...pool].sort((a, b) => pkrPriceOf(a) - pkrPriceOf(b))[0];
}

export async function buildSearchDocuments(
  container: MedusaContainer,
  productIds?: string[],
): Promise<SearchDocumentInput[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const attributesService: ElectronicsAttributesService = container.resolve(ELECTRONICS_ATTRIBUTES_MODULE);
  const warrantyService: WarrantyService = container.resolve(WARRANTY_MODULE);

  const { data: products } = (await query.graph({
    entity: "product",
    fields: PRODUCT_FIELDS,
    ...(productIds?.length ? { filters: { id: productIds } } : {}),
    pagination: { take: 1000, skip: 0 },
  })) as unknown as { data: GraphProduct[] };

  if (products.length === 0) return [];

  const ids = products.map((product) => product.id);

  const attributeValues = (await attributesService.listProductAttributeValues(
    { product_id: ids },
    { relations: ["attribute"] },
  )) as unknown as TypedAttributeValue[];
  const attributeMap = projectAttributeValues(attributeValues);

  const assignments = (await warrantyService.listProductWarrantyAssignments(
    { product_id: ids },
    { relations: ["policy"] },
  )) as unknown as {
    product_id: string;
    variant_id: string | null;
    policy: Parameters<typeof warrantyLabel>[0] & { type: string };
  }[];

  /*
   * Installment minimums, fetched once for the whole batch.
   *
   * This is the denormalisation that makes "from Rs X/month" on a card and a
   * monthly-payment filter possible at all: without it a grid of 24 cards would issue 24
   * plan lookups and the filter could not be expressed as a query (INST-003).
   */
  const installments: InstallmentsService = container.resolve(INSTALLMENTS_MODULE);
  const installmentMinimums = await installments.minimumsByProduct(ids);

  const warrantyByProduct = new Map<string, { label: string; type: string }>();
  for (const assignment of assignments) {
    // Product-level assignments win for a card: it represents the product, not one variant.
    if (assignment.variant_id !== null && warrantyByProduct.has(assignment.product_id)) continue;
    warrantyByProduct.set(assignment.product_id, {
      label: warrantyLabel(assignment.policy),
      type: assignment.policy.type,
    });
  }

  const documents: SearchDocumentInput[] = [];

  for (const product of products) {
    const variant = cardVariant(product);
    const quantity = variant ? availableQuantity(variant) : 0;
    const price = variant ? pkrPriceOf(variant) : 0;

    const compareAt = Number(variant?.metadata?.compare_at_pkr ?? 0) || null;

    const brandName = typeof product.metadata?.brand === "string" ? product.metadata.brand : null;
    const plan = installmentMinimums[product.id];

    const categoryIds = product.categories.map((category) => category.id);
    const specs = variant
      ? await keySpecs(attributesService, product, variant.id)
      : [];

    documents.push({
      id: product.id,
      product_id: product.id,
      variant_id: variant?.id ?? null,
      handle: product.handle,
      title: product.title,
      brand: brandName,
      // Derived, never typed. `brand` is what is printed on the box and stays free text;
      // this is what brand pages and the brand facet key on, so Redmi and POCO land on the
      // Xiaomi page rather than fragmenting it into three (INST-002).
      brand_handle: brandHandle(brandName),
      model: typeof product.metadata?.model === "string" ? product.metadata.model : null,
      sku: variant?.sku ?? null,
      category_ids: categoryIds,
      // Handles rather than ids so a search URL can filter by a readable category.
      category_handles: product.categories.map((category) => category.handle),
      // What makes the channel boundary hold for search as well as for /store/products.
      sales_channel_ids: (product.sales_channels ?? []).map((channel) => channel.id),
      price_pkr: price,
      compare_at_pkr: compareAt && compareAt > price ? compareAt : null,
      in_stock: quantity === null || quantity > 0 || Boolean(variant?.allow_backorder),
      warranty_type: warrantyByProduct.get(product.id)?.type ?? null,
      warranty_label: warrantyByProduct.get(product.id)?.label ?? "No warranty",
      attributes: attributeMap[product.id] ?? {},
      key_specs: specs,
      thumbnail: product.thumbnail,
      // Left at zero until there is a real signal to derive it from. A fabricated
      // popularity score is a dark pattern wearing a ranking function's clothes.
      popularity_score: 0,
      // Only published products are searchable (08_DATA_MODEL.md section 14).
      published: product.status === "published",
      product_created_at: product.created_at ? new Date(product.created_at) : null,
      has_installments: Boolean(plan),
      min_monthly_pkr: plan?.min_monthly_pkr ?? null,
      // The advance belonging to the cheapest monthly plan, not the cheapest advance in the
      // catalogue: quoting two figures from two different plans describes an offer that
      // does not exist.
      min_advance_pkr: plan?.min_advance_pkr ?? null,
    });
  }

  return documents;
}

/**
 * The decisive specs a listing card shows (06_DESIGN_SYSTEM.md section 13).
 *
 * A product belongs to several categories — "Ultrabooks" and "Laptops" — and only some of
 * them carry an attribute schema. Taking the first one produced cards with no specs at
 * all, because the child category had nothing assigned to it. So every category is tried
 * and the first with filterable attributes wins.
 */
async function keySpecs(
  attributesService: ElectronicsAttributesService,
  product: GraphProduct,
  variantId: string,
): Promise<{ label: string; value: string }[]> {
  if (product.categories.length === 0) return [];

  let decisive: { key: string }[] = [];
  for (const category of product.categories) {
    const assigned = (await attributesService.getCategoryAttributes(category.id)).filter(
      (attribute) => attribute.filterable,
    );
    if (assigned.length > 0) {
      decisive = assigned;
      break;
    }
  }

  if (decisive.length === 0) return [];

  const rendered = await attributesService.getRenderedSpecifications(product.id, variantId);
  const byKey = new Map(rendered.map((spec) => [spec.key, spec]));

  return decisive
    .map((attribute) => byKey.get(attribute.key))
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
    .slice(0, CARD_SPEC_LIMIT)
    .map((spec) => ({ label: spec.label, value: spec.value }));
}

/**
 * Reindexes products. With no ids this is a full rebuild and also prunes documents whose
 * product no longer exists or is no longer published.
 */
export async function reindexProducts(
  container: MedusaContainer,
  productIds?: string[],
): Promise<{ indexed: number; pruned: number }> {
  const index: SearchIndexService = container.resolve(SEARCH_MODULE);

  const documents = await buildSearchDocuments(container, productIds);
  await index.indexDocuments(documents);

  // A targeted reindex must not prune: it only saw the products it was asked about.
  const pruned = productIds?.length ? 0 : await index.pruneMissing(documents.map((d) => d.id));

  return { indexed: documents.length, pruned };
}

/** Removes products from the index, e.g. when they are deleted. */
export async function removeFromIndex(
  container: MedusaContainer,
  productIds: string[],
): Promise<void> {
  const index: SearchIndexService = container.resolve(SEARCH_MODULE);
  await index.removeDocuments(productIds);
}
