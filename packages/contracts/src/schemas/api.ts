import { z } from "zod";
import { PK_PROVINCES, addressSchema, cnicSchema, pkMobileSchema, pkrAmountSchema } from "./pakistan.js";

/**
 * Request/response schemas for the custom storefront endpoints.
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md sections 4-5.
 * Every input is untrusted and validated server-side (section 1).
 */

/* GET /api/v1/delivery/quote */
export const deliveryQuoteRequestSchema = z.object({
  cart_id: z.string().min(1),
  province: z.enum(PK_PROVINCES),
  city: z.string().trim().min(2),
  area: z.string().trim().min(1).optional(),
});
export type DeliveryQuoteRequest = z.infer<typeof deliveryQuoteRequestSchema>;

export const deliveryOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  price: pkrAmountSchema,
  currency: z.literal("PKR"),
  eta_min_days: z.number().int().positive(),
  eta_max_days: z.number().int().positive(),
  cod_available: z.boolean(),
  /** Operational caveats, e.g. remote-area surcharge. Never an exact date promise. */
  exceptions: z.array(z.string()).default([]),
});
export type DeliveryOption = z.infer<typeof deliveryOptionSchema>;

export const deliveryQuoteResponseSchema = z.object({
  options: z.array(deliveryOptionSchema),
});

/* POST /api/v1/cod/verify/start */
export const codVerifyStartRequestSchema = z.object({
  cart_id: z.string().min(1),
  phone: pkMobileSchema,
});

export const codVerifyStartResponseSchema = z.object({
  challenge_id: z.string(),
  /** Masked, never the full number back to the browser. */
  masked_destination: z.string(),
  expires_at: z.string().datetime(),
  attempts_remaining: z.number().int().nonnegative(),
});

/* POST /api/v1/cod/verify/complete */
export const codVerifyCompleteRequestSchema = z.object({
  challenge_id: z.string().min(1),
  code: z.string().trim().regex(/^\d{4,8}$/, "Enter the code you received."),
});

export const codVerifyCompleteResponseSchema = z.object({
  verified: z.boolean(),
  attempts_remaining: z.number().int().nonnegative(),
});

/* POST /api/v1/orders/lookup */
export const orderLookupRequestSchema = z.object({
  /** Public order reference; never a sequential internal id (API contract section 4). */
  reference: z.string().trim().min(4),
  /** Second factor: the phone or email used at checkout. */
  phone: pkMobileSchema.optional(),
  email: z.string().trim().email().optional(),
  /** Signed token from the confirmation email, an alternative to the second factor. */
  token: z.string().optional(),
}).refine(
  (value) => Boolean(value.phone || value.email || value.token),
  { message: "Provide the phone or email used on the order.", path: ["phone"] },
);

/* POST /api/v1/returns */
export const returnRequestSchema = z.object({
  order_reference: z.string().trim().min(4),
  token: z.string().min(1),
  items: z
    .array(
      z.object({
        order_line_id: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Select at least one item to return."),
  reason_code: z.string().min(1),
  requested_resolution: z.enum(["refund", "replacement", "repair"]),
  notes: z.string().trim().max(1000).optional(),
});

/* GET /api/v1/search */
export const searchRequestSchema = z.object({
  q: z.string().trim().max(200).default(""),
  category: z.string().trim().optional(),
  brand: z.array(z.string()).default([]),
  /** Canonical brand handles (INST-002). Preferred over free-text `brand`. */
  brand_handle: z.array(z.string()).default([]),
  /**
   * Upper bound on the cheapest monthly payment. Answers "what can I get for Rs 8,000 a
   * month", which is how a large share of this market actually shops.
   */
  monthly_max: z.coerce.number().int().positive().optional(),
  /** Restricts to products with at least one offerable plan. */
  has_installments: z.coerce.boolean().optional(),
  price_gte: z.coerce.number().int().nonnegative().optional(),
  price_lte: z.coerce.number().int().nonnegative().optional(),
  in_stock: z.coerce.boolean().optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest"]).default("relevance"),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(60).default(24),
  /** Category-specific facets, e.g. `attr.ram_gb=16`. Parsed separately from the base query. */
  attributes: z.record(z.array(z.string())).default({}),
  /**
   * Sales channels the caller may see, taken from the publishable key on the request and
   * never from a query parameter. Empty means unscoped, which only happens for a key with
   * no channels linked to it.
   */
  sales_channel_ids: z.array(z.string()).default([]),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const searchFacetValueSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  selected: z.boolean(),
});

export const searchFacetSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["checkbox", "radio", "range"]),
  group: z.string().nullable(),
  unit: z.string().nullable(),
  values: z.array(searchFacetValueSchema),
  /** Present for range facets only. */
  min: z.number().optional(),
  max: z.number().optional(),
});
export type SearchFacet = z.infer<typeof searchFacetSchema>;

export const searchHitSchema = z.object({
  product_id: z.string(),
  variant_id: z.string().nullable(),
  slug: z.string(),
  title: z.string(),
  brand: z.string().nullable(),
  brand_handle: z.string().nullable(),
  model: z.string().nullable(),
  sku: z.string().nullable(),
  price_pkr: pkrAmountSchema,
  compare_at_pkr: pkrAmountSchema.nullable(),
  in_stock: z.boolean(),
  warranty_label: z.string(),
  thumbnail: z.string().nullable(),
  /** The 2-3 decisive specs shown on the card (UX spec section 4). */
  key_specs: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  /**
   * The cheapest monthly figure across this product's offerable plans, for the card's
   * "from Rs X/month" line. Display only: the PDP reads the authoritative plan, and the
   * full disclosure (total payable and the difference from cash) is shown there before
   * anyone can apply (INST-004, ADR-014).
   */
  has_installments: z.boolean().default(false),
  min_monthly_pkr: pkrAmountSchema.nullable().default(null),
  min_advance_pkr: pkrAmountSchema.nullable().default(null),
  /**
   * Filterable attribute values, keyed by attribute key.
   *
   * Carried on the hit so a card can state PTA status where the decision is made rather
   * than only inside the specification list. Buying an unregistered handset unknowingly is
   * the most expensive mistake in this market, and it should not depend on a customer
   * reading to the third line of a spec cluster.
   */
  attributes: z.record(z.array(z.string())).default({}),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema),
  facets: z.array(searchFacetSchema),
  normalized_query: z.string(),
  /** Correlates a search with downstream analytics (08_DATA_MODEL section 15). */
  query_id: z.string(),
  page: z.number().int().positive(),
  per_page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
  suggestions: z.array(z.string()).default([]),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/* POST /store/installment-applications */

export const EMPLOYMENT_TYPES = [
  "salaried",
  "self_employed",
  "business_owner",
  "student",
  "other",
] as const;

export const INSTALLMENT_DOCUMENT_KINDS = [
  "cnic_front",
  "cnic_back",
  "guarantor_cnic_front",
  "guarantor_cnic_back",
  "proof_of_income",
] as const;
export type InstallmentDocumentKind = (typeof INSTALLMENT_DOCUMENT_KINDS)[number];

/** Documents the applicant must supply before an application can be submitted. */
export const REQUIRED_DOCUMENT_KINDS = [
  "cnic_front",
  "cnic_back",
  "guarantor_cnic_front",
  "guarantor_cnic_back",
] as const;

const applicantSchema = z.object({
  full_name: z.string().trim().min(3, "Enter the name exactly as it appears on the CNIC."),
  cnic: cnicSchema,
  phone: pkMobileSchema,
  email: z.string().trim().email("Enter a valid email address."),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of birth as it appears on the CNIC.")
    // 18 is the age at which a person can be held to this agreement at all. Enforced here
    // rather than left to the reviewer, because a rejected application still means we
    // collected a minor's identity documents.
    .refine((value) => {
      const dob = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(dob.getTime())) return false;
      const eighteenYearsAgo = new Date();
      eighteenYearsAgo.setUTCFullYear(eighteenYearsAgo.getUTCFullYear() - 18);
      return dob <= eighteenYearsAgo;
    }, "You must be 18 or older to apply."),
  employment_type: z.enum(EMPLOYMENT_TYPES),
  employer_name: z.string().trim().max(160).optional(),
  monthly_income_pkr: pkrAmountSchema.refine((v) => v > 0, "Enter your monthly income."),
  address: addressSchema,
});

/**
 * The guarantor. Required, and required to be a different person: a guarantor who is the
 * applicant is not a guarantor, and accepting one would make the whole field decorative.
 */
const guarantorSchema = z.object({
  full_name: z.string().trim().min(3, "Enter the guarantor's name as on their CNIC."),
  cnic: cnicSchema,
  phone: pkMobileSchema,
  relationship: z.string().trim().min(2, "How do you know the guarantor?").max(60),
});

export const installmentApplicationRequestSchema = z
  .object({
    cart_id: z.string().min(1),
    plan_id: z.string().min(1),
    applicant: applicantSchema,
    guarantor: guarantorSchema,
    /** Ids returned by the document upload endpoint. Files never travel in this payload. */
    document_ids: z.array(z.string().min(1)).min(REQUIRED_DOCUMENT_KINDS.length),
    /**
     * Consent is versioned and the exact text shown is stored with the application
     * (SEC-008). A boolean alone cannot answer "what did they agree to", which is the only
     * question that matters if the agreement is ever disputed.
     */
    consent: z.object({
      accepted: z.literal(true, {
        errorMap: () => ({ message: "You must accept the terms to apply." }),
      }),
      terms_version: z.string().min(1),
    }),
  })
  .refine((value) => value.applicant.cnic !== value.guarantor.cnic, {
    message: "The guarantor must be someone other than the applicant.",
    path: ["guarantor", "cnic"],
  })
  .refine((value) => value.applicant.phone !== value.guarantor.phone, {
    message: "The guarantor needs their own phone number.",
    path: ["guarantor", "phone"],
  });

export type InstallmentApplicationRequest = z.infer<typeof installmentApplicationRequestSchema>;

/* POST /admin/installments/:id/decision */
export const installmentDecisionRequestSchema = z.object({
  decision: z.enum(["approve", "reject", "request_information"]),
  /** Required on every decision: an unexplained rejection cannot be reviewed or appealed. */
  note: z.string().trim().min(4, "Record why this decision was made.").max(1000),
});
export type InstallmentDecisionRequest = z.infer<typeof installmentDecisionRequestSchema>;
