import { MedusaService } from "@medusajs/framework/utils";
import type { SearchDocumentInput } from "@pk/contracts";
import { SearchDocument } from "./models";
import { buildSearchText } from "./normalize";

/**
 * Search index storage.
 *
 * The module deliberately knows nothing about products, prices or inventory: it stores
 * documents that were composed elsewhere (`src/lib/search-indexer.ts`) from the
 * authoritative modules. Keeping the projection builder outside the module is what keeps
 * the module boundary intact (ADR-005) — a search module that reached into the Product
 * module would be a second, competing read of the catalogue.
 */
class SearchIndexService extends MedusaService({ SearchDocument }) {
  /**
   * Upserts documents.
   *
   * Idempotent by construction: reindexing an unchanged product rewrites the same row.
   * That matters because indexing is driven by events, and event consumers must tolerate
   * duplicates (09_API_AND_EVENT_CONTRACTS.md section 10).
   */
  async indexDocuments(documents: SearchDocumentInput[]): Promise<{ created: number; updated: number }> {
    if (documents.length === 0) return { created: 0, updated: 0 };

    const ids = documents.map((document) => document.id);
    const existing = (await this.listSearchDocuments({ id: ids })) as unknown as { id: string }[];
    const existingIds = new Set(existing.map((document) => document.id));

    const rows = documents.map((document) => toRow(document));

    const toCreate = rows.filter((row) => !existingIds.has(row.id));
    const toUpdate = rows.filter((row) => existingIds.has(row.id));

    // The generated input type widens every `model.json()` column to
    // `Record<string, unknown>`, which a JSON *array* does not satisfy. The columns are
    // genuinely arrays (category ids, key specs), so the cast is at this one write site
    // with the reason attached rather than by loosening the model.
    type WritableRow = Parameters<typeof this.createSearchDocuments>[0];

    if (toCreate.length > 0) await this.createSearchDocuments(toCreate as unknown as WritableRow);
    for (const row of toUpdate) {
      const { id, ...rest } = row;
      await this.updateSearchDocuments({ selector: { id }, data: rest } as unknown as WritableRow);
    }

    return { created: toCreate.length, updated: toUpdate.length };
  }

  async removeDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.deleteSearchDocuments(ids);
  }

  /**
   * Drops documents that are no longer in the catalogue.
   *
   * A full reindex writes the current products; without this, a deleted or unpublished
   * product would keep answering searches forever. Reconciliation, not just incremental
   * updates, is a stated requirement (07_SYSTEM_ARCHITECTURE.md section 7).
   */
  async pruneMissing(keepIds: string[]): Promise<number> {
    const all = (await this.listSearchDocuments({}, { take: null })) as unknown as { id: string }[];
    const keep = new Set(keepIds);
    const stale = all.map((document) => document.id).filter((id) => !keep.has(id));
    await this.removeDocuments(stale);
    return stale.length;
  }
}

function toRow(document: SearchDocumentInput) {
  return {
    id: document.id,
    product_id: document.product_id,
    variant_id: document.variant_id,
    handle: document.handle,
    title: document.title,
    brand: document.brand,
    brand_handle: document.brand_handle,
    model_name: document.model,
    sku: document.sku,
    category_ids: document.category_ids,
    category_handles: document.category_handles,
    sales_channel_ids: document.sales_channel_ids,
    price_pkr: document.price_pkr,
    compare_at_pkr: document.compare_at_pkr,
    in_stock: document.in_stock,
    warranty_type: document.warranty_type,
    warranty_label: document.warranty_label,
    attributes: document.attributes,
    key_specs: document.key_specs,
    thumbnail: document.thumbnail,
    popularity_score: document.popularity_score,
    has_installments: document.has_installments,
    min_monthly_pkr: document.min_monthly_pkr,
    min_advance_pkr: document.min_advance_pkr,
    published: document.published,
    product_created_at: document.product_created_at,
    // Built here rather than by the caller so the indexed text and the query text are
    // normalised by the same code — the single most common way a search index drifts.
    search_text: buildSearchText({
      title: document.title,
      brand: document.brand,
      model: document.model,
      sku: document.sku,
      categories: document.category_handles,
      attributeValues: Object.values(document.attributes ?? {}).flat(),
    }),
    indexed_at: new Date(),
  };
}

export default SearchIndexService;
