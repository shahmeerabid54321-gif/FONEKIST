import Image from "next/image";
import Link from "next/link";
import { formatPkr } from "@/lib/pk";
import { mediaUrl } from "@/lib/media";
import { displayName } from "@/lib/product-name";
import { buildCompareHref, differencesOnly, type Comparison } from "@/lib/compare";
import { dynamicRoute } from "@/lib/routes";

/**
 * The comparison table.
 *
 * A real `<table>` with real `<th scope>` cells, not a grid of divs. A screen reader
 * announces "Battery, Galaxy S24, 4000 mAh" only if the row and column headers are marked
 * up as headers, and a comparison read one value at a time with no idea which phone it
 * belongs to is useless.
 *
 * The horizontal scroll is on the wrapper, never on the page body, and the first column is
 * sticky so the spec name stays visible while the values scroll under it. On a phone that
 * is the difference between a usable comparison and a wall of numbers.
 *
 * The differences-only toggle is a link, not a checkbox, so the state is in the URL and the
 * filtered comparison can be shared exactly as it was read.
 */
export function CompareTable({
  comparison,
  differencesOnlyActive,
}: {
  comparison: Comparison;
  differencesOnlyActive: boolean;
}) {
  const { columns } = comparison;
  const rows = differencesOnlyActive ? differencesOnly(comparison.rows) : comparison.rows;
  const handles = columns.map((column) => column.handle);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={dynamicRoute(
            differencesOnlyActive
              ? buildCompareHref(handles)
              : `${buildCompareHref(handles)}&diff=1`,
          )}
          className="nav-pill nav-pill-flush inline-block text-sm text-[var(--text-soft)] underline underline-offset-4"
        >
          {differencesOnlyActive ? "Show every specification" : "Show differences only"}
        </Link>
        <p className="font-mono text-xs text-[var(--text-muted)]">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </p>
      </div>

      {/*
        The scroll container. `overflow-x: auto` lives here rather than on the page, so a
        wide table never makes the whole document scroll sideways.
      */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">
            Side by side comparison of {columns.length} phones
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-40 bg-[var(--surface)] p-3 text-left align-bottom text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]"
              >
                Specification
              </th>
              {columns.map((column) => {
                const thumbnail = mediaUrl(column.thumbnail);
                return (
                  <th
                    key={column.handle}
                    scope="col"
                    className="min-w-[180px] border-b border-[var(--line)] p-3 text-left align-bottom"
                  >
                    <Link href={`/p/${column.handle}`} className="block">
                      {thumbnail && (
                        <span className="relative mb-3 block aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-sunken)]">
                          <Image
                            src={thumbnail}
                            alt=""
                            fill
                            sizes="200px"
                            className="object-cover"
                          />
                        </span>
                      )}
                      <span className="block font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
                        {column.brand}
                      </span>
                      <span className="mt-1 block font-medium text-[var(--text)]">
                        {displayName(column.title, column.brand)}
                      </span>
                    </Link>

                    {/* Read live, never from the index: this is where somebody decides. */}
                    {column.price != null && (
                      <span className="mt-2 block font-semibold text-[var(--text)]">
                        {formatPkr(column.price)}
                      </span>
                    )}
                    {column.cheapestPlan && (
                      <span className="block text-xs text-[var(--color-emerald-strong)]">
                        from {formatPkr(column.cheapestPlan.monthly_pkr)}/mo
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">
                      {column.stock?.level === "out_of_stock" ? "Out of stock" : "In stock"}
                      {column.warrantyLabel ? ` · ${column.warrantyLabel}` : ""}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[var(--line)]">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-[var(--surface)] p-3 text-left align-top font-medium text-[var(--text-soft)]"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={`${row.key}-${index}`} className="p-3 align-top text-[var(--text)]">
                    {/*
                      A missing value renders as a dash with a spoken label. "Not stated" is
                      information; an empty cell reads as a rendering fault.
                    */}
                    {value ?? (
                      <span className="text-[var(--text-muted)]">
                        <span aria-hidden="true">-</span>
                        <span className="sr-only">Not stated</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-6 text-sm text-[var(--text-soft)]">
          These phones have the same value for every specification we compare on. Turn off
          differences only to see them all.
        </p>
      )}
    </div>
  );
}
