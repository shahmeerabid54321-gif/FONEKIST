import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260908144201 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "storefront_inquiry" drop constraint if exists "storefront_inquiry_channel_id_submission_key_unique";`);
    this.addSql(`alter table if exists "storefront_inquiry" drop constraint if exists "storefront_inquiry_reference_unique";`);
    this.addSql(`alter table if exists "storefront_content" drop constraint if exists "storefront_content_channel_id_unique";`);
    this.addSql(`alter table if exists "inquiry_coupon" drop constraint if exists "inquiry_coupon_channel_id_code_unique";`);
    this.addSql(`create table if not exists "inquiry_access" ("id" text not null, "inquiry_id" text not null, "actor_id" text not null, "action" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "inquiry_access_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_inquiry_access_deleted_at" ON "inquiry_access" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_inquiry_access_inquiry_id" ON "inquiry_access" ("inquiry_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "inquiry_coupon" ("id" text not null, "channel_id" text not null, "code" text not null, "discount_pkr" integer not null, "minimum_advance_pkr" integer not null, "max_redemptions" integer not null, "redemptions" integer not null default 0, "active" boolean not null default true, "expires_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "inquiry_coupon_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_inquiry_coupon_deleted_at" ON "inquiry_coupon" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_inquiry_coupon_channel_id_code_unique" ON "inquiry_coupon" ("channel_id", "code") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "storefront_content" ("id" text not null, "channel_id" text not null, "configuration" jsonb not null, "revision" integer not null default 1, "updated_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "storefront_content_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_storefront_content_channel_id_unique" ON "storefront_content" ("channel_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_storefront_content_deleted_at" ON "storefront_content" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "storefront_inquiry" ("id" text not null, "reference" text not null, "channel_id" text not null, "submission_key" text not null, "request_fingerprint" text not null, "state" text check ("state" in ('new', 'contacted', 'closed', 'cancelled')) not null default 'new', "customer_encrypted" text null, "items" jsonb not null, "advance_pkr" integer not null, "discount_pkr" integer not null, "coupon_code" text null, "terms_version" text not null, "consent_text" text not null, "purge_after" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "storefront_inquiry_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_storefront_inquiry_reference_unique" ON "storefront_inquiry" ("reference") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_storefront_inquiry_deleted_at" ON "storefront_inquiry" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_storefront_inquiry_channel_id_submission_key_unique" ON "storefront_inquiry" ("channel_id", "submission_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_storefront_inquiry_state" ON "storefront_inquiry" ("state") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_storefront_inquiry_purge_after" ON "storefront_inquiry" ("purge_after") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "inquiry_access" cascade;`);

    this.addSql(`drop table if exists "inquiry_coupon" cascade;`);

    this.addSql(`drop table if exists "storefront_content" cascade;`);

    this.addSql(`drop table if exists "storefront_inquiry" cascade;`);
  }

}
