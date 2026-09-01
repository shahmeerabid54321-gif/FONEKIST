import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260822161950 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "idempotency_record" drop constraint if exists "idempotency_record_idempotency_key_operation_unique";`);
    this.addSql(`create table if not exists "idempotency_record" ("id" text not null, "idempotency_key" text not null, "operation" text not null, "request_hash" text null, "status" text check ("status" in ('in_progress', 'succeeded', 'failed')) not null, "result_reference" text null, "result_payload" jsonb null, "error_code" text null, "locked_until" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "idempotency_record_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_idempotency_record_deleted_at" ON "idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_idempotency_record_idempotency_key_operation_unique" ON "idempotency_record" ("idempotency_key", "operation") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_idempotency_record_status" ON "idempotency_record" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "idempotency_record" cascade;`);
  }

}
