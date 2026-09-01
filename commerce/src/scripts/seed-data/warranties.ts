/**
 * Warranty policies — the Phase 0 "return/warranty policy" deliverable, in structured form.
 *
 * CUST-008 requires every published product to carry an explicit policy, including an
 * explicit `none`. The copy follows the UX spec's tone rule (section 13): factual and
 * specific, never "amazing peace of mind".
 */

export interface WarrantySeed {
  handle: string;
  name: string;
  type: "manufacturer" | "distributor" | "shop" | "none";
  provider_name: string | null;
  duration_value: number;
  duration_unit: "day" | "month" | "year";
  coverage_summary: string;
  claim_instructions: string;
  terms_reference: string | null;
  customer_pays_shipping: boolean | null;
}

export const WARRANTIES: WarrantySeed[] = [
  {
    handle: "manufacturer-1y",
    name: "1-year manufacturer warranty",
    type: "manufacturer",
    provider_name: "Manufacturer authorised service centre",
    duration_value: 1,
    duration_unit: "year",
    coverage_summary:
      "Covers manufacturing defects for 12 months from the delivery date. Physical damage, liquid damage and normal wear are not covered.",
    claim_instructions:
      "Contact our support line with your order reference. We will confirm the nearest authorised service centre and the documents required.",
    terms_reference: "/policies/warranty#manufacturer",
    customer_pays_shipping: false,
  },
  {
    handle: "manufacturer-2y",
    name: "2-year manufacturer warranty",
    type: "manufacturer",
    provider_name: "Manufacturer authorised service centre",
    duration_value: 2,
    duration_unit: "year",
    coverage_summary:
      "Covers manufacturing defects for 24 months from the delivery date. Physical damage, liquid damage and normal wear are not covered.",
    claim_instructions:
      "Contact our support line with your order reference. We will confirm the nearest authorised service centre and the documents required.",
    terms_reference: "/policies/warranty#manufacturer",
    customer_pays_shipping: false,
  },
  {
    handle: "distributor-1y",
    name: "1-year distributor warranty",
    type: "distributor",
    provider_name: "Local authorised distributor",
    duration_value: 1,
    duration_unit: "year",
    coverage_summary:
      "Covers manufacturing defects for 12 months, serviced by the local authorised distributor rather than the manufacturer directly.",
    claim_instructions:
      "Raise a claim through our support team. We coordinate the collection and the distributor inspects the unit before repair or replacement.",
    terms_reference: "/policies/warranty#distributor",
    customer_pays_shipping: false,
  },
  {
    handle: "shop-6m",
    name: "6-month shop warranty",
    type: "shop",
    provider_name: null,
    duration_value: 6,
    duration_unit: "month",
    coverage_summary:
      "We repair or replace the unit for manufacturing defects reported within 6 months of delivery.",
    claim_instructions:
      "Contact support with your order reference and a short description of the fault. We arrange collection within Karachi, Lahore and Islamabad.",
    terms_reference: "/policies/warranty#shop",
    customer_pays_shipping: true,
  },
  {
    handle: "none",
    name: "No warranty",
    type: "none",
    provider_name: null,
    duration_value: 0,
    duration_unit: "year",
    coverage_summary: "This item is sold without a warranty.",
    claim_instructions:
      "Not applicable. Faults reported on delivery are still covered by our returns policy.",
    terms_reference: "/policies/returns",
    customer_pays_shipping: null,
  },
];
