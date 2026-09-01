import { PK_PROVINCES, type PkProvince } from "@pk/contracts";

/**
 * Delivery zones and rules.
 *
 * 08_DATA_MODEL.md section 11 notes the final schema depends on the courier APIs, which are
 * not chosen yet. Until then this is a configuration table rather than a database model:
 * it is merchant-tunable (TRD section 14) and gets replaced by real courier quotes behind
 * the same interface once a provider is contracted (FUL-001).
 *
 * UX spec section 5: never promise an exact delivery date without operational evidence.
 * Every option therefore carries an ETA *range*.
 */

export interface DeliveryOption {
  id: string;
  label: string;
  price: number;
  currency: "PKR";
  eta_min_days: number;
  eta_max_days: number;
  cod_available: boolean;
  exceptions: string[];
}

interface ZoneRule {
  /** Cities matched case-insensitively. An empty list means "rest of the province". */
  cities: string[];
  standard: { price: number; etaMin: number; etaMax: number };
  express?: { price: number; etaMin: number; etaMax: number };
  codAvailable: boolean;
  exceptions?: string[];
}

/** Metro cities where the courier network is dense and express is genuinely next-day. */
const METRO_CITIES = ["karachi", "lahore", "islamabad", "rawalpindi"];

const PROVINCE_RULES: Record<PkProvince, ZoneRule[]> = {
  Sindh: [
    {
      cities: ["karachi"],
      standard: { price: 200, etaMin: 1, etaMax: 2 },
      express: { price: 500, etaMin: 1, etaMax: 1 },
      codAvailable: true,
    },
    { cities: [], standard: { price: 300, etaMin: 2, etaMax: 4 }, codAvailable: true },
  ],
  Punjab: [
    {
      cities: ["lahore", "rawalpindi"],
      standard: { price: 250, etaMin: 1, etaMax: 3 },
      express: { price: 600, etaMin: 1, etaMax: 1 },
      codAvailable: true,
    },
    { cities: [], standard: { price: 300, etaMin: 2, etaMax: 5 }, codAvailable: true },
  ],
  "Islamabad Capital Territory": [
    {
      cities: [],
      standard: { price: 250, etaMin: 1, etaMax: 3 },
      express: { price: 600, etaMin: 1, etaMax: 1 },
      codAvailable: true,
    },
  ],
  "Khyber Pakhtunkhwa": [
    { cities: [], standard: { price: 350, etaMin: 3, etaMax: 5 }, codAvailable: true },
  ],
  Balochistan: [
    {
      cities: [],
      standard: { price: 450, etaMin: 4, etaMax: 7 },
      codAvailable: true,
      exceptions: ["Some remote areas are served by a partner courier and may take longer."],
    },
  ],
  "Gilgit-Baltistan": [
    {
      cities: [],
      standard: { price: 550, etaMin: 5, etaMax: 9 },
      // COD is withheld where the return leg is expensive and slow, which is an
      // operational risk decision rather than a customer-facing judgement.
      codAvailable: false,
      exceptions: [
        "Cash on delivery is not available in this region.",
        "Delivery can be delayed by weather and road closures.",
      ],
    },
  ],
  "Azad Jammu & Kashmir": [
    {
      cities: [],
      standard: { price: 500, etaMin: 4, etaMax: 8 },
      codAvailable: false,
      exceptions: ["Cash on delivery is not available in this region."],
    },
  ],
};

export interface QuoteInput {
  province: PkProvince;
  city: string;
  /** Cart subtotal in PKR, used for the free-shipping threshold. */
  subtotal: number;
  /** Whether the cart total is within the COD ceiling. */
  codEligibleByValue: boolean;
}

export function quoteDelivery(input: QuoteInput): DeliveryOption[] {
  const rules = PROVINCE_RULES[input.province] ?? [];
  const city = input.city.trim().toLowerCase();

  const rule =
    rules.find((candidate) => candidate.cities.some((name) => city.includes(name))) ??
    rules.find((candidate) => candidate.cities.length === 0) ??
    rules[0];

  if (!rule) return [];

  const freeShippingThreshold = Number(process.env.FREE_SHIPPING_THRESHOLD_PKR ?? 50000);
  const qualifiesForFreeShipping = input.subtotal >= freeShippingThreshold;

  const codAvailable = rule.codAvailable && input.codEligibleByValue;
  const codExceptions =
    rule.codAvailable && !input.codEligibleByValue
      ? ["Cash on delivery is not available for orders of this value."]
      : [];

  const options: DeliveryOption[] = [
    {
      id: "standard",
      label: "Standard delivery",
      // Free shipping is a real threshold, applied consistently, not a banner claim.
      price: qualifiesForFreeShipping ? 0 : rule.standard.price,
      currency: "PKR",
      eta_min_days: rule.standard.etaMin,
      eta_max_days: rule.standard.etaMax,
      cod_available: codAvailable,
      exceptions: [...(rule.exceptions ?? []), ...codExceptions],
    },
  ];

  if (rule.express) {
    options.push({
      id: "express",
      label: "Express delivery",
      price: rule.express.price,
      currency: "PKR",
      eta_min_days: rule.express.etaMin,
      eta_max_days: rule.express.etaMax,
      cod_available: codAvailable,
      exceptions: [...(rule.exceptions ?? []), ...codExceptions],
    });
  }

  return options;
}

export function isMetroCity(city: string): boolean {
  const normalized = city.trim().toLowerCase();
  return METRO_CITIES.some((metro) => normalized.includes(metro));
}

export const SUPPORTED_PROVINCES = PK_PROVINCES;
