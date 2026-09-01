import { model } from "@medusajs/framework/utils";

/**
 * An identity document attached to an application.
 *
 * The file itself never lives here: this row holds the storage key, the checksum and the
 * scan verdict. Bytes live behind `lib/document-storage.ts` in a private location that no
 * public URL addresses.
 *
 * `scan_status` starts `pending` and the object starts in a quarantine prefix. A reviewer
 * cannot be issued a link to a document that has not passed, which is the whole point of
 * having the column: a scanner whose verdict nothing checks is decoration.
 *
 * The original filename is deliberately not stored. It is attacker-controlled, it is
 * frequently the customer's own name, and nothing downstream needs it.
 */
export const InstallmentDocument = model
  .define("installment_document", {
    id: model.id({ prefix: "idoc" }).primaryKey(),
    application_id: model.text().nullable(),
    /** Ties an upload to the browser session that made it, before an application exists. */
    upload_token: model.text(),
    kind: model.enum([
      "cnic_front",
      "cnic_back",
      "guarantor_cnic_front",
      "guarantor_cnic_back",
      "proof_of_income",
    ]),
    /** Opaque key in the document store. Never a public URL. */
    storage_key: model.text(),
    /** Sniffed from the bytes, not taken from the upload's declared type. */
    mime_type: model.text(),
    size_bytes: model.number(),
    /** Survives deletion of the bytes, so a decision stays auditable (SEC-007). */
    sha256: model.text(),
    scan_status: model.enum(["pending", "clean", "infected", "error"]).default("pending"),
    scanned_at: model.dateTime().nullable(),
    scanner: model.text().nullable(),
    /** Set when the bytes are deleted on retention expiry. The row itself remains. */
    bytes_deleted_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["application_id"] }, { on: ["upload_token"] }, { on: ["scan_status"] }]);
