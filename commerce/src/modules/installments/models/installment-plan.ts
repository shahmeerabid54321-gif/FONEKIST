import { model } from "@medusajs/framework/utils";

/**
 * A curated installment offer for one variant.
 *
 * Plans are authored per variant, not per product: storage tier changes the cash price, and
 * a plan that ignored that would advertise a 256 GB monthly figure on a 512 GB handset.
 *
 * Every amount is an integer number of rupees. `total_payable_pkr` is stored rather than
 * derived so a customer, an admin screen and an auditor read the same number instead of
 * three derivations that can drift; `installmentTotalIsConsistent` in @pk/contracts is what
 * keeps the stored value honest, and the service refuses to write an inconsistent one.
 *
 * There is no interest rate column, and none should be added. The offer is structured as a
 * deferred-payment sale of goods (ADR-025): a cash price, an installment price, and the
 * difference disclosed in rupees.
 */
export const InstallmentPlan = model
  .define("installment_plan", {
    id: model.id({ prefix: "iplan" }).primaryKey(),
    product_id: model.text(),
    variant_id: model.text(),
    /** Customer-facing name, e.g. "12 months". Never a rate. */
    label: model.text(),
    advance_pkr: model.number(),
    monthly_pkr: model.number(),
    tenure_months: model.number(),
    total_payable_pkr: model.number(),
    /** The cash price this plan was authored against, for the disclosure block (INST-004). */
    cash_price_pkr: model.number(),
    active: model.boolean().default(true),
    active_from: model.dateTime().nullable(),
    active_until: model.dateTime().nullable(),
    sort_order: model.number().default(0),
  })
  .indexes([{ on: ["variant_id"] }, { on: ["product_id"] }, { on: ["active"] }]);
