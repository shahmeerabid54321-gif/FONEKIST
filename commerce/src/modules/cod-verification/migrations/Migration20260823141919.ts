import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260823141919 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "cod_verification" ("id" text not null, "cart_id" text not null, "order_id" text null, "phone" text not null, "code_hash" text not null, "method" text check ("method" in ('otp', 'call', 'none')) not null default 'otp', "status" text check ("status" in ('not_required', 'pending', 'verified', 'failed', 'expired')) not null default 'pending', "attempts" integer not null default 0, "max_attempts" integer not null default 5, "expires_at" timestamptz not null, "verified_at" timestamptz null, "reason_code" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cod_verification_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cod_verification_deleted_at" ON "cod_verification" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cod_verification_cart_id" ON "cod_verification" ("cart_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cod_verification_status" ON "cod_verification" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cod_verification_order_id" ON "cod_verification" ("order_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cod_verification" cascade;`);
  }

}
