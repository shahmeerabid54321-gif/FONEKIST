import { model } from "@medusajs/framework/utils";

/**
 * The schedule an installment plan is authored from (ADR-028, amending ADR-025).
 *
 * A rule is an *input*, not an offer. It says what share of a cash price is taken as an
 * advance and how much is added for deferring the rest; `installment_plan` holds the
 * resulting rupee amounts, and only those amounts are ever shown to a customer or returned
 * by a `/store/*` route. There is still no rate on the offer, and the figures here are not
 * one: they do not accrue and they are not annualised.
 *
 * Scope is how "the default for everything, unless somebody changed it for this item"
 * is expressed. One row per (scope, scope_id, tenure), resolved narrowest-first — variant,
 * then product, then a stored global, then the built-in defaults in `@pk/contracts`.
 * Absence means inherit; a row with `active: false` means this tenure is not offered at
 * this scope, which a narrower scope can still overturn.
 */
export const InstallmentRule = model
  .define("installment_rule", {
    id: model.id({ prefix: "irule" }).primaryKey(),
    scope: model.enum(["global", "product", "variant"]),
    /** Null for the global schedule; a product id or a variant id otherwise. */
    scope_id: model.text().nullable(),
    tenure_months: model.number(),
    /** Share of the cash price taken up front, in basis points. 6000 is 60%. */
    advance_bps: model.number(),
    /** Added to the cash price for deferring payment, in basis points. Never a rate. */
    markup_bps: model.number(),
    active: model.boolean().default(true),
    /** The admin who last wrote this row. A schedule change is a pricing act with an author. */
    updated_by: model.text().nullable(),
    sort_order: model.number().default(0),
  })
  .indexes([{ on: ["scope", "scope_id"] }, { on: ["tenure_months"] }]);
