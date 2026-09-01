import type { SearchHit } from "@/lib/pk";
import { ProductCard, type ProductCardData } from "./product-card";

/**
 * A grid of listing cards, built from search hits.
 *
 * Search is non-authoritative (ADR-014): every figure here is a display value and the PDP
 * revalidates before anything is bought. That is precisely why the installment figures are
 * denormalised onto the search document rather than looked up per card, which would have
 * been one query per tile.
 */

const PTA_KEYS = ["pta_status"];

/** Maps a hit onto the card's shape, pulling PTA status out of the indexed attributes. */
export function hitToCard(hit: SearchHit): ProductCardData {
  const attributes = (hit as SearchHit & { attributes?: Record<string, string[]> }).attributes;
  const pta = PTA_KEYS.map((key) => attributes?.[key]?.[0]).find(Boolean) ?? null;

  return {
    handle: hit.slug,
    title: hit.title,
    brand: hit.brand,
    model: hit.model,
    thumbnail: hit.thumbnail,
    price: hit.price_pkr,
    compareAt: hit.compare_at_pkr,
    // The index records a boolean, not a count, so a card says "in stock" or does not.
    // Inventing "only 3 left" from a stale index is the fabricated-scarcity pattern.
    stock: { level: hit.in_stock ? "in_stock" : "out_of_stock", quantity: null },
    warrantyLabel: hit.warranty_label || null,
    monthlyFrom: hit.has_installments ? hit.min_monthly_pkr : null,
    ptaStatus: pta ?? null,
    keySpecs: hit.key_specs,
  };
}

export function ProductGrid({
  products,
  emptyMessage = "No phones match these filters.",
  compare = false,
}: {
  products: ProductCardData[];
  emptyMessage?: string;
  /** Show the shortlist control on each card. Gate on `features.comparison` at the caller. */
  compare?: boolean;
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-8 text-[var(--text-soft)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        // `relative` so the card's stretched heading link covers the whole tile: the tap
        // target on a phone is the card, not four words of title.
        <li key={product.handle} className="relative">
          <ProductCard product={product} compare={compare} />
        </li>
      ))}
    </ul>
  );
}
