import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * The installments domain: plans, applications, documents and the audit trail.
 *
 * `installment_application` is the only table in the system holding a full CNIC, and
 * `installment_audit_event` is what makes the access rule around it auditable rather than
 * aspirational (ADR-024). The two are created together on purpose.
 */
export class Migration20260827121000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "installment_plan" (
      "id" text not null,
      "product_id" text not null,
      "variant_id" text not null,
      "label" text not null,
      "advance_pkr" integer not null,
      "monthly_pkr" integer not null,
      "tenure_months" integer not null,
      "total_payable_pkr" integer not null,
      "cash_price_pkr" integer not null,
      "active" boolean not null default true,
      "active_from" timestamptz null,
      "active_until" timestamptz null,
      "sort_order" integer not null default 0,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "installment_plan_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_plan_variant_id" ON "installment_plan" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_plan_product_id" ON "installment_plan" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_plan_active" ON "installment_plan" ("active") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_plan_deleted_at" ON "installment_plan" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "installment_application" (
      "id" text not null,
      "reference" text not null,
      "state" text check ("state" in ('draft','submitted','under_review','more_information_required','approved','rejected','cancelled','expired','handed_off')) not null default 'submitted',
      "cart_id" text null,
      "order_id" text null,
      "plan_id" text not null,
      "product_id" text not null,
      "variant_id" text not null,
      "plan_label" text not null,
      "advance_pkr" integer not null,
      "monthly_pkr" integer not null,
      "tenure_months" integer not null,
      "total_payable_pkr" integer not null,
      "cash_price_pkr" integer not null,
      "difference_pkr" integer not null,
      "applicant_name" text not null,
      "applicant_cnic" text null,
      "applicant_phone" text not null,
      "applicant_email" text not null,
      "applicant_dob" text null,
      "employment_type" text not null,
      "employer_name" text null,
      "monthly_income_pkr" integer not null,
      "delivery_address" jsonb null,
      "guarantor_name" text not null,
      "guarantor_cnic" text null,
      "guarantor_phone" text not null,
      "guarantor_relationship" text not null,
      "consent_version" text not null,
      "consent_text" text not null,
      "consent_at" timestamptz not null,
      "reservation_id" text null,
      "reserved_until" timestamptz null,
      "decided_at" timestamptz null,
      "decided_by" text null,
      "decision_note" text null,
      "purge_after" timestamptz null,
      "purged_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "installment_application_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_installment_application_reference" ON "installment_application" ("reference") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_application_state" ON "installment_application" ("state") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_application_order_id" ON "installment_application" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_application_cart_id" ON "installment_application" ("cart_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_application_reserved_until" ON "installment_application" ("reserved_until") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_application_purge_after" ON "installment_application" ("purge_after") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_application_deleted_at" ON "installment_application" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "installment_document" (
      "id" text not null,
      "application_id" text null,
      "upload_token" text not null,
      "kind" text check ("kind" in ('cnic_front','cnic_back','guarantor_cnic_front','guarantor_cnic_back','proof_of_income')) not null,
      "storage_key" text not null,
      "mime_type" text not null,
      "size_bytes" integer not null,
      "sha256" text not null,
      "scan_status" text check ("scan_status" in ('pending','clean','infected','error')) not null default 'pending',
      "scanned_at" timestamptz null,
      "scanner" text null,
      "bytes_deleted_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "installment_document_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_document_application_id" ON "installment_document" ("application_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_document_upload_token" ON "installment_document" ("upload_token") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_document_scan_status" ON "installment_document" ("scan_status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_document_deleted_at" ON "installment_document" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "installment_audit_event" (
      "id" text not null,
      "application_id" text not null,
      "action" text not null,
      "actor" text not null,
      "from_state" text null,
      "to_state" text null,
      "note" text null,
      "detail" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "installment_audit_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_audit_event_application_id" ON "installment_audit_event" ("application_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_audit_event_action" ON "installment_audit_event" ("action") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_installment_audit_event_deleted_at" ON "installment_audit_event" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "installment_audit_event" cascade;`);
    this.addSql(`drop table if exists "installment_document" cascade;`);
    this.addSql(`drop table if exists "installment_application" cascade;`);
    this.addSql(`drop table if exists "installment_plan" cascade;`);
  }
}
