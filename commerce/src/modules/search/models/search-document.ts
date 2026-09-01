import { model } from "@medusajs/framework/utils";

/**
 * The derived search document. Source of truth: 08_DATA_MODEL.md section 14.
 *
 * ADR-004 makes search a *derived* projection rebuilt from commerce data, and ADR-003
 * makes it non-authoritative: nothing here decides a price or an availability at
 * checkout. That is why every purchase-critical field in this table is a display value
 * that the PDP and cart revalidate against Medusa before anything is charged.
 *
 * Only public fields are stored — no cost, supplier or admin notes (section 14).
 */
export const SearchDocument = model
  .define("search_document", {
    /** Product id, so a reindex of one product is a single upsert. */
    id: model.text().primaryKey(),
    product_id: model.text(),
    /** The variant a listing card shows: the cheapest one in stock. */
    variant_id: model.text().nullable(),
    handle: model.text(),
    title: model.text(),
    brand: model.text().nullable(),
    /**
     * Canonical brand identity (`brandHandle` in @pk/contracts). `brand` is free text and
     * stays free text because it is what is printed on the box; this is what filters,
     * facets and brand pages key on, so Redmi and POCO land on the Xiaomi page rather than
     * fragmenting it into three near-empty ones (INST-002).
     */
    brand_handle: model.text().nullable(),
    model_name: model.text().nullable(),
    sku: model.text().nullable(),
    category_ids: model.json().nullable(),
    category_handles: model.json().nullable(),
    /**
     * The sales channels this product is sold through.
     *
     * A derived index does not inherit the sales-channel scoping Medusa applies to
     * `/store/products`. Without this column, `/store/search` answers every publishable key
     * with the whole catalogue, which silently defeats the boundary that decides what each
     * storefront may sell (ADR-022).
     */
    sales_channel_ids: model.json().nullable(),
    price_pkr: model.number().default(0),
    compare_at_pkr: model.number().nullable(),
    in_stock: model.boolean().default(false),
    warranty_type: model.text().nullable(),
    warranty_label: model.text().nullable(),
    /** Filterable attribute values, keyed by attribute key. */
    attributes: model.json().nullable(),
    /** The two or three decisive specs a card shows (06_DESIGN_SYSTEM.md section 13). */
    key_specs: model.json().nullable(),
    thumbnail: model.text().nullable(),
    /**
     * Ranking input. Derived from real signals only — never a merchandising thumb on the
     * scale dressed up as popularity (PRD section 8).
     */
    popularity_score: model.number().default(0),
    /**
     * Everything a customer might type, normalised and space-separated. Trigram matching
     * runs against this single column so a typo in any one field still scores.
     */
    search_text: model.text().default(""),
    /**
     * Installment availability, denormalised from the installments module.
     *
     * Without these three columns a grid showing "from Rs X/month" would issue one query
     * per card, and "monthly payment under Rs Y" could not be expressed in the search query
     * at all. Like every other field here they are display values: the PDP reads the
     * authoritative plan before anything is agreed (ADR-014).
     */
    has_installments: model.boolean().default(false),
    min_monthly_pkr: model.number().nullable(),
    min_advance_pkr: model.number().nullable(),
    published: model.boolean().default(true),
    /** The product's own creation time, so "Newest" sorts by the catalog, not the index. */
    product_created_at: model.dateTime().nullable(),
    indexed_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["published"] },
    { on: ["handle"] },
    { on: ["in_stock"] },
    // Brand pages are FONEKIST's top-level navigation, so this is the hottest filter in
    // the catalogue and the one field the original design assumed was already indexed.
    { on: ["brand_handle"] },
    // "What can I get for Rs 8,000 a month" is a range scan over this column.
    { on: ["min_monthly_pkr"] },
  ]);
