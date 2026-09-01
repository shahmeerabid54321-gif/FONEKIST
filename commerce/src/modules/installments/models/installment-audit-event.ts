import { model } from "@medusajs/framework/utils";

/**
 * Append-only audit trail (ADR-024, SEC-006).
 *
 * Every state change and, crucially, every read of a full CNIC or document writes a row
 * here. An access-control rule with no record of who exercised it cannot be audited, and
 * "only the reviewer role can see it" is a claim rather than a control until there is a
 * log saying which reviewer saw what and when.
 *
 * Nothing in this table may contain a CNIC, a document's bytes or a full phone number. The
 * service enforces that; `detail` is for the id and the action, not the data.
 */
export const InstallmentAuditEvent = model
  .define("installment_audit_event", {
    id: model.id({ prefix: "iaud" }).primaryKey(),
    application_id: model.text(),
    action: model.text(),
    /** Admin user id, or "system" for a scheduled job. */
    actor: model.text(),
    from_state: model.text().nullable(),
    to_state: model.text().nullable(),
    note: model.text().nullable(),
    detail: model.json().nullable(),
  })
  .indexes([{ on: ["application_id"] }, { on: ["action"] }]);
