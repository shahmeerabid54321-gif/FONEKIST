import {
  getProductByHandle,
  getProductExtras,
  defaultVariant,
  priceFor,
  stockLevelFor,
  type MedusaProduct,
  type RenderedSpec,
  type StockLevel,
} from "./catalog";
import { listPlans, cheapestMonthly, type PlanView } from "./installments";

/**
 * Phone comparison.
 *
 * The one rule that shapes everything here: price, stock and plans are read live, never
 * from the search index (ADR-014). A comparison table is where somebody decides which
 * handset to buy, so it is the last place a stale price belongs.
 *
 * Comparable fields come from `AttributeDefinition.comparable`, which already exists and is
 * already the catalogue's definition of "worth putting side by side". Nothing here decides
 * for itself which specs matter.
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

function brandOf(product: MedusaProduct): string | null {
  const brand = product.metadata?.brand;
  return typeof brand === "string" ? brand : null;
}

function modelOf(product: MedusaProduct): string | null {
  const model = product.metadata?.model;
  return typeof model === "string" ? model : null;
}

async function loadColumn(
  handle: string,
): Promise<{ column: CompareColumn; specs: RenderedSpec[] } | null> {
  const product = await getProductByHandle(handle);
  if (!product) return null;

  const variant = defaultVariant(product);
  const extras = await getProductExtras(product.id, variant?.id ?? null);
  const plans = variant ? await listPlans(variant.id) : [];
  const price = variant ? priceFor(variant) : null;

  return {
    column: {
      handle: product.handle,
      title: product.title,
      brand: brandOf(product),
      model: modelOf(product),
      thumbnail: product.thumbnail,
      price: price?.amount ?? null,
      compareAt: price?.compareAt ?? null,
      stock: variant ? stockLevelFor(variant) : null,
      warrantyLabel: extras.warranty ? extras.warranty.label : null,
      cheapestPlan: cheapestMonthly(plans),
      specs: new Map(extras.specs.map((spec) => [spec.key, spec.value])),
    },
    // Only comparable attributes, so what belongs in a comparison is a catalogue decision
    // rather than a UI one.
    specs: extras.specs.filter((spec) => spec.comparable),
  };
}

export async function buildComparison(handles: string[]): Promise<Comparison> {
  const loaded = await Promise.all(handles.map(loadColumn));

  const columns: CompareColumn[] = [];
  const specSets: RenderedSpec[][] = [];
  const missing: string[] = [];

  loaded.forEach((entry, index) => {
    if (!entry) {
      missing.push(handles[index]!);
      return;
    }
    columns.push(entry.column);
    specSets.push(entry.specs);
  });

  /*
   * The union of every comparable attribute, in the order the first column presents them.
   *
   * Union rather than intersection: a spec one handset has and another does not is exactly
   * the kind of difference somebody is comparing to find. A missing cell renders as a dash,
   * which is information rather than a gap.
   */
  const order: { key: string; label: string; group: string | null }[] = [];
  const seen = new Set<string>();
  for (const specs of specSets) {
    for (const spec of specs) {
      if (seen.has(spec.key)) continue;
      seen.add(spec.key);
      order.push({ key: spec.key, label: spec.label, group: spec.group });
    }
  }

  const rows: CompareRow[] = order.map((entry) => {
    const values = columns.map((column) => column.specs.get(entry.key) ?? null);
    const present = values.filter((value) => value !== null);
    const differs =
      new Set(values.map((value) => value ?? " ")).size > 1 || present.length !== values.length;
    return { ...entry, values, differs };
  });

  return { columns, rows, missing };
}

/** Rows worth showing when "differences only" is on. */
export function differencesOnly(rows: CompareRow[]): CompareRow[] {
  return rows.filter((row) => row.differs);
}
