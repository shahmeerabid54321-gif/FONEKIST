import {
  getProductByHandle,
  getProductExtras,
  defaultVariant,
  priceFor,
  stockLevelFor,
  type MedusaProduct,
  type RenderedSpec,
} from "./catalog";
import { listPlans, cheapestMonthly } from "./installments";
import {
  MAX_COMPARE,
  buildCompareHref,
  parseCompareHandles,
  type CompareColumn,
  type CompareRow,
  type Comparison,
} from "./compare-shared";

// Re-exported so every existing server call site keeps importing from one place, and the
// split stays an implementation detail of the client bundle rather than an API change.
export {
  MAX_COMPARE,
  buildCompareHref,
  parseCompareHandles,
  type CompareColumn,
  type CompareRow,
  type Comparison,
};

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
  // Both depend on the variant and neither depends on the other, so they go together. They
  // used to run one after the other, which made a three-way comparison three round trips
  // deep per column instead of two.
  const [extras, plans] = await Promise.all([
    getProductExtras(product.id, variant?.id ?? null),
    variant ? listPlans(variant.id) : Promise.resolve([]),
  ]);
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
