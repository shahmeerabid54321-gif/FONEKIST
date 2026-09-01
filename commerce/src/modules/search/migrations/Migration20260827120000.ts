import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Brand identity and installment availability on the search document.
 *
 * `brand_handle` is the field the original design assumed already existed. It did not:
 * `brand` is free text with no index, so filtering by brand was a case-insensitive scan and
 * `Xiaomi`, `MI`, `Redmi` and `POCO` were four separate brands. Brand pages are FONEKIST's
 * top-level navigation, so this is now the hottest filter in the catalogue.
 *
 * The three installment columns are denormalised from the installments module so a grid
 * can show "from Rs X/month" in one query rather than one query per card, and so a monthly
 * payment filter can be expressed as a range scan.
 *
 * Both are backfilled by `pnpm search:reindex`, not by this migration: the values are
 * derived from modules this migration has no business reaching into.
 */
export class Migration20260827120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "search_document" add column if not exists "brand_handle" text null;`);
    this.addSql(`alter table if exists "search_document" add column if not exists "has_installments" boolean not null default false;`);
    this.addSql(`alter table if exists "search_document" add column if not exists "min_monthly_pkr" integer null;`);
    this.addSql(`alter table if exists "search_document" add column if not exists "min_advance_pkr" integer null;`);

    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_search_document_brand_handle" ON "search_document" ("brand_handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_search_document_min_monthly_pkr" ON "search_document" ("min_monthly_pkr") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_search_document_brand_handle";`);
    this.addSql(`drop index if exists "IDX_search_document_min_monthly_pkr";`);
    this.addSql(`alter table if exists "search_document" drop column if exists "brand_handle";`);
    this.addSql(`alter table if exists "search_document" drop column if exists "has_installments";`);
    this.addSql(`alter table if exists "search_document" drop column if exists "min_monthly_pkr";`);
    this.addSql(`alter table if exists "search_document" drop column if exists "min_advance_pkr";`);
  }
}
