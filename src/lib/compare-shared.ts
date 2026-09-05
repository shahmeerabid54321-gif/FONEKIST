import type { StockLevel } from "./catalog";
import type { PlanView } from "./installments";

/**
 * The parts of a comparison that both the server and the browser need.
 *
 * `lib/compare.ts` reads commerce, so it imports `catalog.ts` and `installments.ts`, which
 * since the move to Cache Components import `cacheLife` and `cacheTag`. Those are
 * server-only. The comparison tray is a client component and needed exactly two things from
 * that module — the cap and a URL builder, both pure — but importing them dragged the whole
 * server read path into the browser bundle, which stopped being merely wasteful and became
 * a build error.
 *
 * So the pure half lives here and imports nothing at runtime: the two type imports are
 * erased at compile time. `lib/compare.ts` re-exports all of it, so nothing on the server
 * has to know this file exists.
 */

/**
 * Three at most.
 *
 * Not an arbitrary cap: four columns of specifications do not fit a phone screen without
 * either hiding a column behind a scroll or using type too small to read, and a comparison
 * you cannot read is worse than no comparison.
 */
export const MAX_COMPARE = 3;

export interface CompareColumn {
  handle: string;
  title: string;
  brand: string | null;
  model: string | null;
  thumbnail: string | null;
  price: number | null;
  compareAt: number | null;
  stock: { level: StockLevel; quantity: number | null } | null;
  warrantyLabel: string | null;
  cheapestPlan: PlanView | null;
  specs: Map<string, string>;
}

export interface CompareRow {
  key: string;
  label: string;
  group: string | null;
  values: (string | null)[];
  /** True when at least two columns disagree. Drives the differences-only toggle. */
  differs: boolean;
}

export interface Comparison {
  columns: CompareColumn[];
  rows: CompareRow[];
  /** Handles that were requested but could not be loaded, so the page can say so. */
  missing: string[];
}

/** Parses and de-duplicates the `ids` query parameter, capped at three. */
export function parseCompareHandles(raw: string | string[] | undefined): string[] {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(values)].slice(0, MAX_COMPARE);
}

export function buildCompareHref(handles: string[]): string {
  const unique = [...new Set(handles)].slice(0, MAX_COMPARE);
  return unique.length > 0 ? `/compare?ids=${unique.join(",")}` : "/compare";
}
