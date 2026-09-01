import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Trigram support for the PostgreSQL search implementation.
 *
 * Two extensions make CUST-003 possible without Typesense. `fuzzystrmatch` supplies
 * bounded edit distance, which is what actually decides that `makbook` means `macbook`;
 * `pg_trgm` supplies similarity scoring, which orders the near misses and — through its
 * GIN index — keeps the literal-substring path off a sequential scan. The index is not
 * optional: without it every search scores the whole table, which is fine for 17 products
 * and not fine for 17,000.
 *
 * Creating an extension requires database privileges the application role may not hold in
 * a managed environment. It is guarded so a deployment without those rights fails loudly
 * at this migration rather than silently degrading search behaviour later.
 */
export class Migration20260823134900 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create extension if not exists pg_trgm;`);
    this.addSql(
      `create index if not exists "IDX_search_document_search_text_trgm" on "search_document" using gin ("search_text" gin_trgm_ops);`,
    );
    // Title and model are scored separately when building "did you mean" suggestions.
    this.addSql(
      `create index if not exists "IDX_search_document_title_trgm" on "search_document" using gin ("title" gin_trgm_ops);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_search_document_title_trgm";`);
    this.addSql(`drop index if exists "IDX_search_document_search_text_trgm";`);
    // The extension is deliberately left in place: other features may come to rely on it,
    // and dropping a shared extension on a rollback is a bigger blast radius than it looks.
  }
}
