import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Installment schedules become data (ADR-028).
 *
 * `installment_rule` holds the advance and markup shares a plan is derived from, so the
 * default schedule can be retuned, and overridden for one product or one storage tier,
 * without a deploy. The offer itself is unchanged: `installment_plan` still stores rupee
 * amounts and nothing else.
 *
 * The unique index on `installment_plan` is the second half of the change. Plans are now
 * reconciled in place keyed on (variant, tenure) rather than written once at seed time, and
 * a constraint is the only thing that makes "one row per tenure per variant" a fact rather
 * than a property of the service that happens to be true today. It is created concurrently
 * with nothing else because a pre-existing duplicate would fail it — check for duplicates
 * before migrating a database that predates this.
 */
export class Migration20260904120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "installment_rule" (
      "id" text not null,
      "scope" text check ("scope" in ('global','product','variant')) not null,
      "scope_id" text null,
      "tenure_months" integer not null,
      "advance_bps" integer not null,
      "markup_bps" integer not null,
      "active" boolean not null default true,
      "updated_by" text null,
      "sort_order" integer not null default 0,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "installment_rule_pkey" primary key ("id"));`);
    // One rule per tenure per scope. Two rows for the same tenure would make the resolved
    // schedule depend on row order, which is to say on nothing.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_installment_rule_scope_tenure" ON "installment_rule" ("scope", coalesce("scope_id", ''), "tenure_months") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_rule_scope_id" ON "installment_rule" ("scope", "scope_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_rule_deleted_at" ON "installment_rule" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_installment_plan_variant_tenure" ON "installment_plan" ("variant_id", "tenure_months") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_installment_plan_variant_tenure";`);
    this.addSql(`drop table if exists "installment_rule" cascade;`);
  }
}
