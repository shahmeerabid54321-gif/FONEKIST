import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260822161948 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "category_attribute_assignment" drop constraint if exists "category_attribute_assignment_category_id_attribute_id_unique";`);
    this.addSql(`alter table if exists "attribute_definition" drop constraint if exists "attribute_definition_key_unique";`);
    this.addSql(`alter table if exists "attribute_group" drop constraint if exists "attribute_group_handle_unique";`);
    this.addSql(`create table if not exists "attribute_group" ("id" text not null, "name" text not null, "handle" text not null, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "attribute_group_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_attribute_group_handle_unique" ON "attribute_group" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_attribute_group_deleted_at" ON "attribute_group" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "attribute_definition" ("id" text not null, "key" text not null, "name" text not null, "value_type" text check ("value_type" in ('string', 'int', 'decimal', 'bool', 'enum', 'multi_enum')) not null, "unit" text null, "enum_values" jsonb null, "filterable" boolean not null default false, "comparable" boolean not null default true, "searchable" boolean not null default false, "variant_scoped" boolean not null default false, "description" text null, "group_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "attribute_definition_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_attribute_definition_key_unique" ON "attribute_definition" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_attribute_definition_group_id" ON "attribute_definition" ("group_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_attribute_definition_deleted_at" ON "attribute_definition" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_attribute_definition_filterable" ON "attribute_definition" ("filterable") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_attribute_definition_variant_scoped" ON "attribute_definition" ("variant_scoped") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "category_attribute_assignment" ("id" text not null, "category_id" text not null, "attribute_id" text not null, "required" boolean not null default false, "filterable_override" boolean null, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "category_attribute_assignment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_attribute_assignment_attribute_id" ON "category_attribute_assignment" ("attribute_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_attribute_assignment_deleted_at" ON "category_attribute_assignment" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_attribute_assignment_category_id" ON "category_attribute_assignment" ("category_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_category_attribute_assignment_category_id_attribute_id_unique" ON "category_attribute_assignment" ("category_id", "attribute_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "product_attribute_value" ("id" text not null, "product_id" text not null, "variant_id" text null, "attribute_id" text not null, "value_string" text null, "value_number" numeric null, "value_bool" boolean null, "value_enum" jsonb null, "display_override" text null, "source" text null, "raw_value_number" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_attribute_value_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attribute_value_attribute_id" ON "product_attribute_value" ("attribute_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attribute_value_deleted_at" ON "product_attribute_value" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attribute_value_product_id" ON "product_attribute_value" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attribute_value_variant_id" ON "product_attribute_value" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attribute_value_attribute_id_value_number" ON "product_attribute_value" ("attribute_id", "value_number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attribute_value_attribute_id_value_string" ON "product_attribute_value" ("attribute_id", "value_string") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "attribute_definition" add constraint "attribute_definition_group_id_foreign" foreign key ("group_id") references "attribute_group" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table if exists "category_attribute_assignment" add constraint "category_attribute_assignment_attribute_id_foreign" foreign key ("attribute_id") references "attribute_definition" ("id") on update cascade;`);

    this.addSql(`alter table if exists "product_attribute_value" add constraint "product_attribute_value_attribute_id_foreign" foreign key ("attribute_id") references "attribute_definition" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "attribute_definition" drop constraint if exists "attribute_definition_group_id_foreign";`);

    this.addSql(`alter table if exists "category_attribute_assignment" drop constraint if exists "category_attribute_assignment_attribute_id_foreign";`);

    this.addSql(`alter table if exists "product_attribute_value" drop constraint if exists "product_attribute_value_attribute_id_foreign";`);

    this.addSql(`drop table if exists "attribute_group" cascade;`);

    this.addSql(`drop table if exists "attribute_definition" cascade;`);

    this.addSql(`drop table if exists "category_attribute_assignment" cascade;`);

    this.addSql(`drop table if exists "product_attribute_value" cascade;`);
  }

}
