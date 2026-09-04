import Image from "next/image";
import Link from "next/link";
import { formatPkr } from "@/lib/pk";
import { mediaUrl } from "@/lib/media";
import { displayName } from "@/lib/product-name";
import { dynamicRoute } from "@/lib/routes";
import type { StockLevel } from "@/lib/catalog";
import { IconCalendar, IconShieldCheck } from "./icons";
import { CompareChip } from "./compare-chip";

/**
 * A listing card.
 *
 * Shaped the way phone shops actually sell: the photograph gets a large square tile of its
 * own, the name and one line of specification sit under it, and the price is the biggest
 * thing in the text block. The card used to be a bordered box with a 4:3 crop and five
 * stacked lines of grey micro-copy under it, which read as a database row and gave nobody
 * a reason to look twice.
 *
 * One shared tile colour behind every photograph is what makes a row read as a set rather
 * than a jumble sale: the pictures arrive with different backgrounds and white balance, and
 * the tile is the only thing that unifies them.
 *
 * What earns a place in the text:
 *   brand and model, because the same marketing name covers different hardware here;
 *   one line of specification, which is the line a shopper actually compares on;
 *   price, largest;
 *   the monthly figure, because a large share of this market shops by it;
 *   PTA status, because buying an unregistered handset unknowingly is the most expensive
 *   mistake available in this market.
 *
 * What is deliberately absent, including from the designs this was modelled on: stars,
 * review counts, "N people are viewing", a countdown, and a discount percentage computed
 * from a list price nobody pays. There is no review data, so a rating here could never
 * render truthfully.
 */
export interface ProductCardData {
  handle: string;
  title: string;
  brand: string | null;
  model: string | null;
  thumbnail: string | null;
  price: number;
  compareAt: number | null;
  stock: { level: StockLevel; quantity: number | null } | null;
  warrantyLabel: string | null;
  monthlyFrom: number | null;
  ptaStatus: string | null;
  keySpecs?: { label: string; value: string }[];
}

const STOCK_TEXT: Record<StockLevel, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  preorder: "Available to order",
};

export function ProductCard({
  product,
  compare = false,
}: {
  product: ProductCardData;
  /** Show the shortlist control. Off by default so a card stays a pure server component. */
  compare?: boolean;
}) {
  const thumbnail = mediaUrl(product.thumbnail);
  const stock = product.stock;
  const soldOut = stock?.level === "out_of_stock";

  // Only ever drawn from a compare-at that is genuinely higher. There is no list price to
  // inflate against and no badge invented to fill the corner.
  const saving =
    product.compareAt != null && product.compareAt > product.price
      ? product.compareAt - product.price
      : null;

  /*
   * The one line a shopper compares on: "8 GB RAM · 256 GB · 5000 mAh".
   *
   * PTA status is filtered out of it. The index happens to return it among the key specs,
   * and it already has its own chip on the tile and its own line below the price, so
   * leaving it in printed "PTA Approved" twice on every card and pushed the specification
   * that actually distinguishes two handsets off the end of the line.
   */
  const specLine = (product.keySpecs ?? [])
    .filter((spec) => !/pta/i.test(spec.label))
    .slice(0, 3)
    .map((spec) => spec.value)
    .join(" · ");

  return (
    <article className="group flex h-full flex-col">
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-tile)]">
        {thumbnail && (
          <Image
            src={thumbnail}
            // Decorative: the heading immediately below carries the same name, so alt text
            // here would make a screen reader announce the product twice.
            alt=""
            fill
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
            className={
              soldOut
                ? "tile-media object-cover opacity-55 grayscale"
                : "tile-media object-cover"
            }
          />
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
          {saving != null && (
            <span className="rounded-[var(--radius-chip)] bg-[var(--color-amber-wash)] px-2.5 py-1 text-xs font-semibold text-[var(--color-amber-ink)]">
              Save {formatPkr(saving)}
            </span>
          )}
          {/*
            Stated on the card, not buried in the specification table. Somebody who finds
            out at the counter that a handset needs registering has already paid for it.
          */}
          {product.ptaStatus === "not_approved" && (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] bg-[var(--color-amber-wash)] px-2.5 py-1 text-xs font-semibold text-[var(--color-amber-ink)]">
              <IconShieldCheck className="h-3.5 w-3.5" />
              Not PTA approved
            </span>
          )}
          {soldOut && (
            <span className="rounded-[var(--radius-chip)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)]">
              Out of stock
            </span>
          )}
        </div>

        {/*
          Shortlist from the grid, not only from the product page.

          `z-10` because the title link stretches over the whole card through
          `after:inset-0`, and a control underneath that overlay is a control nobody can
          press. It appears on hover on a pointer device and is always present on a touch
          one, where there is no hover to reveal it.
        */}
        {compare && (
          <div className="absolute bottom-3 right-3 z-10 opacity-100 transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
            <CompareChip handle={product.handle} title={product.title} />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        <h3 className="text-[15px] font-semibold leading-snug text-[var(--text)]">
          <Link
            href={`/p/${product.handle}`}
            className="after:absolute after:inset-0 focus-visible:underline"
          >
            {product.brand ? `${product.brand} ` : ""}
            {displayName(product.title, product.brand)}
          </Link>
        </h3>

        {specLine && (
          <p className="mt-1.5 line-clamp-1 text-[13px] text-[var(--text-muted)]">{specLine}</p>
        )}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-xl font-semibold tracking-tight text-[var(--text)]">
            {formatPkr(product.price)}
          </span>
          {saving != null && product.compareAt != null && (
            <span className="text-sm text-[var(--text-muted)] line-through">
              {formatPkr(product.compareAt)}
            </span>
          )}
        </div>

        {product.monthlyFrom != null && (
          /*
            The monthly figure is the link into the plans.

            It sat above the title link's full-card overlay as plain text, so the one thing
            on the card that says this phone can be bought monthly went nowhere in
            particular. `relative z-[1]` lifts it back out of that overlay; the rest of the
            card still opens the cash view.
          */
          <Link
            href={dynamicRoute(`/p/${product.handle}?pay=installments`)}
            className="relative z-[1] mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-emerald-strong)] underline-offset-4 hover:underline focus-visible:underline"
          >
            <IconCalendar className="h-4 w-4" />
            or from {formatPkr(product.monthlyFrom)} a month
          </Link>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-muted)]">
          {product.ptaStatus === "approved" && (
            <span className="inline-flex items-center gap-1 text-[var(--color-emerald-strong)]">
              <IconShieldCheck className="h-3.5 w-3.5" />
              PTA approved
            </span>
          )}
          {product.warrantyLabel && <span>{product.warrantyLabel}</span>}
          {stock && !soldOut && (
            <span>
              {/*
                "Only N left" appears only when N is the real remaining count. It is never
                shown for a variant with plenty in stock and never invented.
              */}
              {stock.level === "low_stock" && stock.quantity != null
                ? `Only ${stock.quantity} left`
                : STOCK_TEXT[stock.level]}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
