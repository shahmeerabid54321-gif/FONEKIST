import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260823144659 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "return_item" drop constraint if exists "return_item_request_id_foreign";`);

    this.addSql(`create table if not exists "rma_request" ("id" text not null, "order_id" text not null, "order_reference" text not null, "customer_id" text null, "status" text check ("status" in ('requested', 'approved', 'rejected', 'received', 'completed', 'cancelled')) not null default 'requested', "reason_code" text not null, "notes" text null, "requested_resolution" text check ("requested_resolution" in ('refund', 'replacement', 'repair')) not null default 'refund', "reviewed_at" timestamptz null, "reviewed_by" text null, "decision_reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rma_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rma_request_deleted_at" ON "rma_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rma_request_order_id" ON "rma_request" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rma_request_status" ON "rma_request" ("status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "rma_item" ("id" text not null, "request_id" text not null, "order_line_id" text not null, "title" text not null, "quantity" integer not null, "received_condition" text null, "inspection_note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rma_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rma_item_request_id" ON "rma_item" ("request_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rma_item_deleted_at" ON "rma_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "rma_item" add constraint "rma_item_request_id_foreign" foreign key ("request_id") references "rma_request" ("id") on update cascade;`);

    this.addSql(`drop table if exists "return_request" cascade;`);

    this.addSql(`drop table if exists "return_item" cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "rma_item" drop constraint if exists "rma_item_request_id_foreign";`);

    this.addSql(`create table if not exists "return_request" ("id" text not null, "order_id" text not null, "order_reference" text not null, "customer_id" text null, "status" text check ("status" in ('requested', 'approved', 'rejected', 'received', 'completed', 'cancelled')) not null default 'requested', "reason_code" text not null, "notes" text null, "requested_resolution" text check ("requested_resolution" in ('refund', 'replacement', 'repair')) not null default 'refund', "reviewed_at" timestamptz null, "reviewed_by" text null, "decision_reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "return_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_return_request_deleted_at" ON "return_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_return_request_order_id" ON "return_request" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_return_request_status" ON "return_request" ("status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "return_item" ("id" text not null, "request_id" text not null, "order_line_id" text not null, "title" text not null, "quantity" integer not null, "received_condition" text null, "inspection_note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "return_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_return_item_request_id" ON "return_item" ("request_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_return_item_deleted_at" ON "return_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "return_item" add constraint "return_item_request_id_foreign" foreign key ("request_id") references "return_request" ("id") on update cascade;`);

    this.addSql(`drop table if exists "rma_request" cascade;`);

    this.addSql(`drop table if exists "rma_item" cascade;`);
  }

}
