import { model } from "@medusajs/framework/utils";

/**
 * A credit application against one installment plan.
 *
 * FONEKIST is the lender (decision D2), so this row is the evidence for a receivable, not
 * a lead. That is why the plan is snapshotted onto it and never re-read from the catalogue
 * (INST-006, the same rule as WAR-001), and why the identity fields below are governed by
 * ADR-024 rather than treated as ordinary customer data.
 *
 * CNIC handling, in one place so it is auditable:
 *  - `applicant_cnic` and `guarantor_cnic` are the only two columns in the system holding a
 *    full CNIC. They are never selected into a log line, a search document, a notification
 *    body or an analytics payload.
 *  - Every list view renders `maskCnic`. The full value is readable only in the reviewer
 *    detail view, and every such read appends an `InstallmentAuditEvent`.
 *  - They are nulled on retention expiry (SEC-007); the application row itself survives,
 *    because the decision has to remain auditable after the identity data is gone.
 */
export const InstallmentApplication = model
  .define("installment_application", {
    id: model.id({ prefix: "iapp" }).primaryKey(),
    /** Public reference the customer quotes. Not sequential: it must not enumerate. */
    reference: model.text().unique(),

    state: model
      .enum([
        "draft",
        "submitted",
        "under_review",
        "more_information_required",
        "approved",
        "rejected",
        "cancelled",
        "expired",
        "handed_off",
      ])
      .default("submitted"),

    cart_id: model.text().nullable(),
    order_id: model.text().nullable(),
    plan_id: model.text(),
    product_id: model.text(),
    variant_id: model.text(),

    /* -- Plan snapshot. Frozen at submission; a catalogue edit cannot rewrite it. ------ */
    plan_label: model.text(),
    advance_pkr: model.number(),
    monthly_pkr: model.number(),
    tenure_months: model.number(),
    total_payable_pkr: model.number(),
    cash_price_pkr: model.number(),
    difference_pkr: model.number(),

    /* -- Applicant (ADR-024) ----------------------------------------------------------- */
    applicant_name: model.text(),
    applicant_cnic: model.text().nullable(),
    applicant_phone: model.text(),
    applicant_email: model.text(),
    applicant_dob: model.text().nullable(),
    employment_type: model.text(),
    employer_name: model.text().nullable(),
    monthly_income_pkr: model.number(),
    delivery_address: model.json().nullable(),

    /* -- Guarantor (ADR-024) ----------------------------------------------------------- */
    guarantor_name: model.text(),
    guarantor_cnic: model.text().nullable(),
    guarantor_phone: model.text(),
    guarantor_relationship: model.text(),

    /* -- Consent (SEC-008) ------------------------------------------------------------- */
    /** Version identifier of the terms shown. */
    consent_version: model.text(),
    /** The exact text the customer saw. A boolean cannot answer "agreed to what". */
    consent_text: model.text(),
    consent_at: model.dateTime(),

    /* -- Stock reservation (D3) -------------------------------------------------------- */
    reservation_id: model.text().nullable(),
    /** When an unreviewed application releases its stock and expires (INST-009). */
    reserved_until: model.dateTime().nullable(),

    /* -- Decision ---------------------------------------------------------------------- */
    decided_at: model.dateTime().nullable(),
    decided_by: model.text().nullable(),
    decision_note: model.text().nullable(),

    /** When the identity documents and CNIC values are due for deletion (SEC-007). */
    purge_after: model.dateTime().nullable(),
    purged_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["state"] },
    { on: ["order_id"] },
    { on: ["cart_id"] },
    { on: ["reserved_until"] },
    { on: ["purge_after"] },
  ]);
