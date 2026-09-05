import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { features } from "@/lib/features";
import { buildComparison, MAX_COMPARE, parseCompareHandles } from "@/lib/compare";
import { search } from "@/lib/search";
import { CompareTable } from "@/components/compare-table";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { degradeGracefully } from "@/lib/log";
import { dynamicRoute } from "@/lib/routes";
import { CatalogUnavailable } from "@/components/catalog-unavailable";

export const metadata: Metadata = {
  title: "Compare phones",
  description: "Put up to three phones side by side, with live prices, stock and plans.",
};

/**
 * Comparison.
 *
 * The selection is entirely in the URL (`?ids=a,b,c`), which is what makes a comparison
 * shareable: the whole point of building one is to send it to somebody.
 *
 * Everything in the table is read live rather than from the search index (ADR-014). This is
 * the page where somebody decides which handset to buy, so a stale price here would be a
 * stale price at the worst possible moment.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Gated because comparison ships before the installment work (release order in the plan).
  // A flag that is off must not leave a half-built page reachable by URL.
  if (!features.comparison) notFound();

  const params = await searchParams;
  const handles = parseCompareHandles(params.ids);
  const differencesOnlyActive = params.diff === "1";

  if (handles.length === 0) {
    const suggestions = await degradeGracefully("compare.suggestions", null, () =>
      search({ q: "", sort: "newest", perPage: 6, inStockOnly: true }),
    );

    return (
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
          Compare phones
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--text-soft)]">
          Pick up to {MAX_COMPARE} phones and see their specifications side by side. Add one
          from any product page, or start from the list below.
        </p>
        {suggestions && suggestions.hits.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-medium text-[var(--text)]">Newest in stock</h2>
            <div className="mt-5">
              <ProductGrid products={suggestions.hits.map(hitToCard)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  /*
   * Every figure in this table is read live rather than from the search index, so this page
   * has no cache to fall back on when commerce is unreachable, exactly like the product
   * page. It says so instead of throwing: a comparison that cannot be built is not a
   * comparison of nothing.
   */
  const comparison = await degradeGracefully("compare.table", null, () =>
    buildComparison(handles),
  );

  if (!comparison) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
          Compare phones
        </h1>
        <div className="mt-8">
          <CatalogUnavailable retryHref={dynamicRoute(`/compare?ids=${handles.join(",")}`)} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
        Comparing {comparison.columns.length}{" "}
        {comparison.columns.length === 1 ? "phone" : "phones"}
      </h1>

      {comparison.columns.length === 1 && (
        <p className="mt-2 text-[var(--text-soft)]">
          Add another phone from any product page to see them side by side.{" "}
          <Link href="/phones" className="underline">
            Browse phones
          </Link>
        </p>
      )}

      {/*
        Stated rather than silently dropped. A comparison that quietly shows two of the
        three phones somebody asked for looks like it worked.
      */}
      {comparison.missing.length > 0 && (
        <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-amber)] bg-[var(--color-amber-wash)] px-4 py-3 text-sm text-[var(--color-amber-ink)]">
          We could not find {comparison.missing.join(", ")}, so it is not in this comparison.
        </p>
      )}

      {comparison.columns.length > 0 && (
        <div className="mt-8">
          <CompareTable comparison={comparison} differencesOnlyActive={differencesOnlyActive} />
        </div>
      )}
    </div>
  );
}
