# ADR-005: Inquiry checkout and owner-managed storefront

Accepted scope: the owner's 8 September 2026 request supersedes the previous prohibition
on a checkout page. This is an inquiry checkout, not a payment checkout or credit approval.
Fonekist retains its visual design and clear installment-cost disclosures.

The reference requires full name, Pakistani mobile, optional alternative mobile and email,
CNIC, city, city-dependent area, full address and optional notes. Customers review selected
phones/plans and total advance, remove items, accept terms/privacy, and submit one inquiry.
No charge, stock reservation or Medusa order should be created merely by sending an inquiry.
The existing credit application/order workflow remains separate.

The final city/area list is merchant configuration, not assumed national coverage. Coupons
must not appear unless backed by configured, server-validated offers. Reference claims such
as free delivery or no verification must not be copied without merchant confirmation.

An inquiry must snapshot authoritative plan figures, reject withdrawn or changed plans,
respect the requesting sales channel, validate all input server-side and handle duplicates
atomically in persistent storage. Confirmation exposes an opaque reference, not identity data.
CNIC must not enter logs, analytics, general metadata, cache, or notifications. Any new
identity persistence must define encryption, restricted/audited disclosure and retention;
it must not silently reuse a credit application with fabricated guarantor/income fields.

The owner must be able to maintain content and delivery coverage through authenticated
admin controls. Existing Medusa product descriptions, media, categories and brand categories,
plus installment schedules, should be used and verified before building replacements.
Banner content and inquiry management need explicit admin surfaces.

Render free is owner-review staging. Production readiness additionally requires durable
media/database storage, backup/recovery, reliable background work, shared coordination when
scaling, cache invalidation across instances, and measured mixed customer traffic.

Owner confirmed: Karachi only initially; include admin-managed coupons. The initial area selector uses an explicit Other Karachi area entry until the merchant supplies subdivisions.
