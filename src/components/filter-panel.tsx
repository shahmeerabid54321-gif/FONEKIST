"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SearchFacet } from "@/lib/pk";
import {
  activeChips,
  buildFilterQuery,
  hasActiveFilters,
  toggleAttributeValue,
  toggleBrand,
  type FilterState,
} from "@/lib/filters";
import { dynamicRoute } from "@/lib/routes";

/**
 * Filters.
 *
 * Every control is a link, not a form control that mutates hidden state. That is what makes
 * the URL the single source of truth: the back button works, a filtered view can be shared,
 * and the page still filters with JavaScript disabled. Filter state kept in a component
 * would be a second copy that eventually disagrees with the URL.
 *
 * Only the open/closed state of the mobile sheet is component state, because it is
 * genuinely presentational and belongs nowhere else.
 */

const MONTHLY_STEPS = [5000, 8000, 12000, 20000, 35000];

export function FilterPanel({
  state,
  facets,
  brandFacet,
  total,
}: {
  state: FilterState;
  facets: SearchFacet[];
  brandFacet: SearchFacet | null;
  total: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const chips = activeChips(state, brandFacet ? [...facets, brandFacet] : facets);

  const href = (next: FilterState) => dynamicRoute(`${pathname}${buildFilterQuery(next)}`);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="filter-panel"
        className="w-full rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-2.5 text-sm font-medium text-[var(--text)] lg:hidden"
      >
        {open ? "Hide filters" : "Filters"}
        {hasActiveFilters(state) && (
          <span className="ml-2 font-mono text-xs text-[var(--text)]">
            {chips.length}
          </span>
        )}
      </button>

      {chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.label}>
              <Link
                href={dynamicRoute(`${pathname}${chip.removeQuery}`)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-xs text-[var(--text)]"
              >
                {chip.label}
                <span aria-hidden="true">x</span>
                <span className="sr-only">Remove this filter</span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={dynamicRoute(pathname)}
              className="inline-flex rounded-[var(--radius-chip)] px-3 py-1 text-xs text-[var(--text-muted)] underline"
            >
              Clear all
            </Link>
          </li>
        </ul>
      )}

      <div
        id="filter-panel"
        className={`${open ? "block" : "hidden"} mt-5 space-y-7 lg:block`}
      >
        <p className="font-mono text-xs text-[var(--text-muted)]">
          {total} {total === 1 ? "phone" : "phones"}
        </p>

        {/*
          Monthly payment first. It is the question a large part of this market is actually
          asking, and burying it under spec facets would be organising the page around what
          is easy to index rather than around how people shop.
        */}
        <fieldset>
          <legend className="text-sm font-medium text-[var(--text)]">Monthly payment</legend>
          <ul className="mt-3 space-y-1.5">
            {MONTHLY_STEPS.map((step) => {
              const selected = state.monthlyMax === step;
              return (
                <li key={step}>
                  <Link
                    href={href({
                      ...state,
                      monthlyMax: selected ? null : step,
                      installmentsOnly: !selected,
                      page: 1,
                    })}
                    aria-current={selected ? "true" : undefined}
                    className={
                      selected
                        ? "nav-pill nav-pill-flush inline-block text-sm font-semibold text-[var(--text)] underline underline-offset-4 decoration-[var(--brand-dot)] decoration-2"
                        : "nav-pill nav-pill-flush inline-block text-sm text-[var(--text-soft)]"
                    }
                  >
                    Up to Rs {step.toLocaleString("en-PK")} a month
                  </Link>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {brandFacet && brandFacet.values.length > 1 && (
          <fieldset>
            <legend className="text-sm font-medium text-[var(--text)]">Brand</legend>
            <ul className="mt-3 space-y-1.5">
              {brandFacet.values.map((value) => {
                const selected = state.brands.includes(value.value);
                return (
                  <li key={value.value}>
                    <Link
                      href={href(toggleBrand(state, value.value))}
                      aria-current={selected ? "true" : undefined}
                      className={
                        selected
                          ? "text-sm font-medium text-[var(--text)]"
                          : "nav-pill nav-pill-flush inline-block text-sm text-[var(--text-soft)]"
                      }
                    >
                      {value.label}
                      <span className="ml-1.5 font-mono text-xs text-[var(--text-muted)]">
                        {value.count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        <fieldset>
          <legend className="text-sm font-medium text-[var(--text)]">Availability</legend>
          <ul className="mt-3 space-y-1.5">
            <li>
              <Link
                href={href({ ...state, inStockOnly: !state.inStockOnly, page: 1 })}
                aria-current={state.inStockOnly ? "true" : undefined}
                className={
                  state.inStockOnly
                    ? "text-sm font-medium text-[var(--text)]"
                    : "nav-pill nav-pill-flush inline-block text-sm text-[var(--text-soft)]"
                }
              >
                In stock only
              </Link>
            </li>
          </ul>
        </fieldset>

        {facets
          .filter((facet) => facet.key !== "brand" && facet.key !== "brand_handle")
          .filter((facet) => facet.values.length > 1)
          .map((facet) => (
            <fieldset key={facet.key}>
              <legend className="text-sm font-medium text-[var(--text)]">{facet.label}</legend>
              <ul className="mt-3 space-y-1.5">
                {facet.values.map((value) => {
                  const selected = (state.attributes[facet.key] ?? []).includes(value.value);
                  return (
                    <li key={value.value}>
                      <Link
                        href={href(toggleAttributeValue(state, facet.key, value.value))}
                        aria-current={selected ? "true" : undefined}
                        className={
                          selected
                            ? "text-sm font-medium text-[var(--text)]"
                            : "nav-pill nav-pill-flush inline-block text-sm text-[var(--text-soft)]"
                        }
                      >
                        {value.label}
                        <span className="ml-1.5 font-mono text-xs text-[var(--text-muted)]">
                          {value.count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
      </div>
    </>
  );
}
