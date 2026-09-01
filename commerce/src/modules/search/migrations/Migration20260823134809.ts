import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260823134809 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "search_document" ("id" text not null, "product_id" text not null, "variant_id" text null, "handle" text not null, "title" text not null, "brand" text null, "model_name" text null, "sku" text null, "category_ids" jsonb null, "category_handles" jsonb null, "price_pkr" integer not null default 0, "compare_at_pkr" integer null, "in_stock" boolean not null default false, "warranty_type" text null, "warranty_label" text null, "attributes" jsonb null, "key_specs" jsonb null, "thumbnail" text null, "popularity_score" integer not null default 0, "search_text" text not null default '', "published" boolean not null default true, "product_created_at" timestamptz null, "indexed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "search_document_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_search_document_deleted_at" ON "search_document" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_search_document_published" ON "search_document" ("published") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_search_document_handle" ON "search_document" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_search_document_in_stock" ON "search_document" ("in_stock") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "search_document" cascade;`);
  }

}
