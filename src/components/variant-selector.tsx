import Link from "next/link";
import { formatPkr } from "@/lib/pk";
import { priceFor, stockLevelFor, type MedusaProduct, type MedusaVariant } from "@/lib/catalog";

/**
 * Variant selector. Source of truth: ADR-001 section 5.
 *
 * Selection lives in the URL (`?variant=`), so choosing a variant is a real navigation:
 * it is linkable, shareable, survives a refresh and works without JavaScript. Each option
 * shows its own price, because on this catalogue the storage or configuration step is
 * often the largest price difference on the page.
 *
 * Unavailable combinations are shown and labelled rather than hidden, so a customer can
 * see the variant exists and is out of stock instead of wondering where it went.
 */
export function VariantSelector({
  product,
  selectedVariant,
}: {
  product: MedusaProduct;
  selectedVariant: MedusaVariant;
}) {
  if (product.variants.length <= 1) return null;

  const optionTitle = product.options[0]?.title ?? "Option";

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-[var(--text)]">{optionTitle}</legend>
      <ul className="flex flex-wrap gap-2">
        {product.variants.map((variant) => {
          const selected = variant.id === selectedVariant.id;
          const stock = stockLevelFor(variant);
          const outOfStock = stock.level === "out_of_stock";
          const { amount } = priceFor(variant);

          return (
            <li key={variant.id}>
              <Link
                href={`/p/${product.handle}?variant=${variant.id}`}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={[
                  "flex min-h-[52px] flex-col justify-center rounded-[var(--radius-control)] border px-4 py-2 transition-colors",
                  selected
                    ? "border-[var(--text)] bg-[var(--text)] text-[var(--surface)]"
                    : "border-[var(--line-strong)] hover:bg-[var(--surface-sunken)]",
                  outOfStock ? "opacity-60" : "",
                ].join(" ")}
              >
                <span className="text-sm font-medium">{variant.title}</span>
                {/* The muted role is defined against the page ground. On a selected chip the
                    ground is ink, so the same token fails contrast: the secondary line has
                    to dim relative to *its* ground, not the page's. */}
                <span
                  className={`font-mono text-sm ${
                    selected ? "opacity-75" : "text-[var(--text-muted)]"
                  }`}
                >
                  {formatPkr(amount)}
                  {outOfStock && " · Out of stock"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
