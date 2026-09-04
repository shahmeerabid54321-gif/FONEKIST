import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  DEFAULT_INSTALLMENT_RULES,
  INSTALLMENT_RULE_SCOPES,
  installmentRulesUpsertSchema,
  type InstallmentRuleScope,
} from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../../modules/installments";
import type InstallmentsService from "../../../../modules/installments/service";
import { fail, ok, requestIdOf } from "../../../../lib/http";
import { VARIANT_PRICE_FIELDS, pkrPriceOf, type PricedVariant } from "../../../../lib/variant-price";
import { reindexProducts } from "../../../../lib/search-indexer";

/**
 * Installment schedules (ADR-028).
 *
 * GET    — the rules authored at one scope, plus the schedule that actually resolves there,
 *          so the form can show an inherited value and say where it came from.
 * POST   — replaces the schedule at one scope and rewrites the affected plans.
 * DELETE — removes the override so the scope inherits again.
 *
 * Two things are deliberate:
 *
 *  - **No idempotency key.** A schedule write is a last-write-wins replacement of a small
 *    set of rows, so replaying it lands on the same state. The decision route needs a key
 *    because approving twice sends two messages; this does not.
 *  - **The search index is rewritten inline.** "From Rs X a month" on a card is served from
 *    the index, and the reconciliation job runs hourly. Without this a card would advertise
 *    a monthly figure that the PDP no longer offers, for up to an hour.
 *
 * Admin routes are authenticated and role-checked by Medusa's admin middleware before
 * reaching this handler (SEC-002).
 */

interface AffectedVariant {
  product_id: string;
  variant_id: string;
  cash_price_pkr: number;
}

/** The variants a change at this scope reprices. A global change reprices nothing inline. */
async function affectedVariants(
  req: AuthenticatedMedusaRequest,
  scope: InstallmentRuleScope,
  scopeId: string | null,
): Promise<AffectedVariant[]> {
  if (scope === "global" || !scopeId) return [];

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product_variant",
    fields: [...VARIANT_PRICE_FIELDS],
    filters: scope === "variant" ? { id: scopeId } : { product_id: scopeId },
  });

  return ((data ?? []) as unknown as PricedVariant[]).map((variant) => ({
    product_id: variant.product_id,
    variant_id: variant.id,
    cash_price_pkr: pkrPriceOf(variant),
  }));
}

async function repriceAndReindex(
  req: AuthenticatedMedusaRequest,
  installments: InstallmentsService,
  variants: AffectedVariant[],
): Promise<{ variants: number; created: number; updated: number; deactivated: number }> {
  const totals = { variants: variants.length, created: 0, updated: 0, deactivated: 0 };

  for (const variant of variants) {
    const result = await installments.regeneratePlansFor(
      variant.product_id,
      variant.variant_id,
      variant.cash_price_pkr,
    );
    totals.created += result.created;
    totals.updated += result.updated;
    totals.deactivated += result.deactivated;
  }

  const productIds = [...new Set(variants.map((variant) => variant.product_id))];
  if (productIds.length > 0) await reindexProducts(req.scope, productIds);

  return totals;
}

function readScope(
  req: AuthenticatedMedusaRequest,
): { scope: InstallmentRuleScope; scopeId: string | null } | null {
  const scope = String(req.query.scope ?? "").trim();
  if (!(INSTALLMENT_RULE_SCOPES as readonly string[]).includes(scope)) return null;

  const scopeId = String(req.query.scope_id ?? "").trim() || null;
  if ((scope === "global") !== (scopeId === null)) return null;

  return { scope: scope as InstallmentRuleScope, scopeId };
}

const BAD_SCOPE = {
  code: "VALIDATION_ERROR" as const,
  message: "scope must be global, product or variant, and only global takes no scope_id.",
  field_errors: { scope: ["Must be global, product or variant."] },
};

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const target = readScope(req);
    if (!target) {
      res.status(400).json(fail(BAD_SCOPE, requestId));
      return;
    }

    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const authored = await installments.listRulesAt(target.scope, target.scopeId);

    // For a product or variant, "effective" is what a customer would actually be offered.
    // For the global scope it is the stored schedule falling back to the built-in one.
    const variantId = target.scope === "variant" ? (target.scopeId ?? "") : "";
    const productId = target.scope === "product" ? (target.scopeId ?? "") : "";
    const effective =
      target.scope === "global"
        ? await installments.resolveRulesFor("", "")
        : await installments.resolveRulesFor(productId, variantId);

    /*
     * Which variants hold plans authored against a price the handset no longer has.
     *
     * Computed here rather than in the browser so the screen makes one request instead of
     * one per variant, and so "the price has moved" is decided by the same comparison the
     * regeneration will act on.
     */
    const drift: { variant_id: string; plan_cash_price_pkr: number; cash_price_pkr: number }[] = [];
    for (const variant of await affectedVariants(req, target.scope, target.scopeId)) {
      const plans = await installments.listOfferablePlans(variant.variant_id);
      const stale = plans.find((plan) => plan.cash_price_pkr !== variant.cash_price_pkr);
      if (stale) {
        drift.push({
          variant_id: variant.variant_id,
          plan_cash_price_pkr: stale.cash_price_pkr,
          cash_price_pkr: variant.cash_price_pkr,
        });
      }
    }

    res.json(
      ok(
        {
          scope: target.scope,
          scope_id: target.scopeId,
          authored,
          effective,
          drift,
          defaults: DEFAULT_INSTALLMENT_RULES,
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const parsed = installmentRulesUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "That schedule cannot be saved as written.",
            field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
          },
          requestId,
        ),
      );
      return;
    }

    const { scope, scope_id: scopeId, rules } = parsed.data;
    const actor = req.auth_context?.actor_id ?? "unknown";

    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const authored = await installments.upsertRules(scope, scopeId, rules, actor);

    // A global change reprices the whole catalogue, which is a job, not a request. The
    // count tells the operator what is now waiting on `installments:regenerate`.
    const variants = await affectedVariants(req, scope, scopeId);
    const repriced = await repriceAndReindex(req, installments, variants);

    logger.info(
      `Installment schedule updated at ${scope}${scopeId ? `:${scopeId}` : ""} by ${actor}; ${repriced.variants} variant(s) repriced.`,
    );

    res.json(ok({ scope, scope_id: scopeId, authored, repriced }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const target = readScope(req);
    if (!target || target.scope === "global") {
      res.status(400).json(
        fail(
          {
            ...BAD_SCOPE,
            message:
              "Only a product or variant schedule can be removed. Reset the global one by saving the defaults.",
          },
          requestId,
        ),
      );
      return;
    }

    const actor = req.auth_context?.actor_id ?? "unknown";
    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const removed = await installments.clearRules(target.scope, target.scopeId);

    const variants = await affectedVariants(req, target.scope, target.scopeId);
    const repriced = await repriceAndReindex(req, installments, variants);

    logger.info(
      `Installment schedule at ${target.scope}:${target.scopeId} removed by ${actor}; ${repriced.variants} variant(s) repriced.`,
    );

    res.json(ok({ scope: target.scope, scope_id: target.scopeId, removed, repriced }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
