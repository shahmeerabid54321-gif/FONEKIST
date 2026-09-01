import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { fail, ok, requestIdOf } from "../../../lib/http";
import { currentTerms } from "../../../lib/installment-terms";

/**
 * GET /store/installment-terms
 *
 * The consent text currently in force, with its version.
 *
 * Served from commerce rather than written into the storefront so there is exactly one copy
 * of the wording. The application records the version the customer agreed to and stores the
 * text verbatim alongside it (SEC-008), which only means anything if the text shown and the
 * text stored come from the same place.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  try {
    res.json(ok(currentTerms(), requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
