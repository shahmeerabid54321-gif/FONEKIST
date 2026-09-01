import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260822161949 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_warranty_assignment" drop constraint if exists "product_warranty_assignment_product_id_variant_id_unique";`);
    this.addSql(`alter table if exists "order_line_warranty_snapshot" drop constraint if exists "order_line_warranty_snapshot_order_line_id_unique";`);
    this.addSql(`create table if not exists "order_line_warranty_snapshot" ("id" text not null, "order_id" text not null, "order_line_id" text not null, "type" text check ("type" in ('manufacturer', 'distributor', 'shop', 'none')) not null, "provider_name" text null, "duration_value" integer not null default 0, "duration_unit" text check ("duration_unit" in ('day', 'month', 'year')) not null, "coverage_summary" text not null, "claim_instructions" text not null, "terms_reference" text null, "terms_version" text not null, "label" text not null, "source_policy_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_line_warranty_snapshot_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_line_warranty_snapshot_order_line_id_unique" ON "order_line_warranty_snapshot" ("order_line_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_line_warranty_snapshot_deleted_at" ON "order_line_warranty_snapshot" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_line_warranty_snapshot_order_id" ON "order_line_warranty_snapshot" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "warranty_policy" ("id" text not null, "name" text not null, "type" text check ("type" in ('manufacturer', 'distributor', 'shop', 'none')) not null, "provider_name" text null, "duration_value" integer not null default 0, "duration_unit" text check ("duration_unit" in ('day', 'month', 'year')) not null, "coverage_summary" text not null, "claim_instructions" text not null, "terms_reference" text null, "terms_version" text not null default 'v1', "customer_pays_shipping" boolean null, "active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "warranty_policy_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_warranty_policy_deleted_at" ON "warranty_policy" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "product_warranty_assignment" ("id" text not null, "product_id" text not null, "variant_id" text null, "policy_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_warranty_assignment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_warranty_assignment_policy_id" ON "product_warranty_assignment" ("policy_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_warranty_assignment_deleted_at" ON "product_warranty_assignment" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_warranty_assignment_product_id" ON "product_warranty_assignment" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_warranty_assignment_product_id_variant_id_unique" ON "product_warranty_assignment" ("product_id", "variant_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "product_warranty_assignment" add constraint "product_warranty_assignment_policy_id_foreign" foreign key ("policy_id") references "warranty_policy" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_warranty_assignment" drop constraint if exists "product_warranty_assignment_policy_id_foreign";`);

    this.addSql(`drop table if exists "order_line_warranty_snapshot" cascade;`);

    this.addSql(`drop table if exists "warranty_policy" cascade;`);

    this.addSql(`drop table if exists "product_warranty_assignment" cascade;`);
  }

}
