import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { installmentDisclosure } from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../modules/installments";
import type InstallmentsService from "../../../modules/installments/service";
import { fail, ok, requestIdOf } from "../../../lib/http";

/**
 * GET /store/installment-plans?variant_id=…
 *
 * The authoritative read for a PDP. The search index carries "from Rs X/month" so a grid
 * renders in one query, but that is a display value (ADR-014); this endpoint is what the
 * customer actually agrees to, and it is uncached.
 *
 * Every plan is returned with its full disclosure computed server-side — cash price,
 * advance, monthly times tenure, total payable, and the difference from cash in rupees and
 * per cent (INST-004). The storefront renders those figures; it does not derive them, so a
 * page cannot show arithmetic the backend would not stand behind.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const variantId = String(req.query.variant_id ?? "").trim();
    if (!variantId) {
      res.status(400).json(
        fail(
          { code: "VALIDATION_ERROR", message: "A variant is required to price a plan." },
          requestId,
        ),
      );
      return;
    }

    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);
    const plans = await installments.listOfferablePlans(variantId);

    res.json(
      ok(
        {
          plans: plans.map((plan) => ({
            id: plan.id,
            label: plan.label,
            variant_id: plan.variant_id,
            ...installmentDisclosure(plan),
          })),
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
