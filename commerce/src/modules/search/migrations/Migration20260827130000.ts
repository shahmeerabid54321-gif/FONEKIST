import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Sales channels on the search document.
 *
 * Without this, `/store/search` was answering every publishable key with the whole
 * catalogue. Medusa scopes `/store/products` by the key's sales channels automatically, but
 * a *derived* index built by our own code inherits none of that, so the FONEKIST key was
 * being served laptops and headphones through search while `/store/products` correctly
 * returned phones only.
 *
 * That is the ADR-022 boundary, so it is fixed here, in the index, rather than by teaching
 * the storefront to filter for phones. A filter there would be a second, weaker copy of the
 * rule, and the two would eventually disagree.
 *
 * Backfilled by `pnpm search:reindex`, not by this migration: the value is derived from the
 * Product module, which this migration has no business reaching into.
 */
export class Migration20260827130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "search_document" add column if not exists "sales_channel_ids" jsonb null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_search_document_sales_channel_ids" ON "search_document" USING gin ("sales_channel_ids") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_search_document_sales_channel_ids";`);
    this.addSql(`alter table if exists "search_document" drop column if exists "sales_channel_ids";`);
  }
}
