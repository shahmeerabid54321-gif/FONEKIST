/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/schemas/brands.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

/**
 * Brand identity for the catalogue.
 *
 * `brand` on a product is free text typed by whoever created it, which is fine for display
 * and useless for grouping: `Xiaomi`, `MI`, `Redmi` and `POCO` are four strings and one
 * manufacturer. A storefront that navigates by brand needs them to be one thing, so every
 * brand also gets a canonical handle derived here.
 *
 * The handle is what filters, facets and brand pages key on. The free-text `brand` is what
 * is displayed, because that is the name printed on the box the customer is holding.
 */

/**
 * Sub-brands and spellings that resolve to a parent brand.
 *
 * Only entries where the mapping is a fact about the manufacturer, not an opinion about
 * merchandising. Redmi and POCO are Xiaomi product lines; Tecno and Infinix are separate
 * brands under one holding company and are deliberately NOT folded together, because a
 * customer shopping for a Tecno does not consider an Infinix the same thing.
 */
export const BRAND_ALIASES: Record<string, string> = {
  mi: "xiaomi",
  redmi: "xiaomi",
  poco: "xiaomi",
  "xiaomi-redmi": "xiaomi",
  "xiaomi-poco": "xiaomi",
  oneplus: "oneplus",
  "one-plus": "oneplus",
  realme: "realme",
  iqoo: "vivo",
  honor: "honor",
  "google-pixel": "google",
  pixel: "google",
  "samsung-galaxy": "samsung",
  galaxy: "samsung",
  apple: "apple",
  iphone: "apple",
};

/** Slugifies a brand name: lower case, ASCII, hyphen separated. */
export function slugifyBrand(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The canonical handle for a brand name, or null when there is no brand.
 *
 * Null rather than an empty string: an empty string is a value that silently matches
 * nothing and sorts first, while null forces every caller to decide what "no brand" means.
 */
export function brandHandle(name: string | null | undefined): string | null {
  if (!name) return null;
  const slug = slugifyBrand(name);
  if (slug.length === 0) return null;
  return BRAND_ALIASES[slug] ?? slug;
}

/**
 * Display name for a canonical handle, used where only the handle is available (a brand
 * page reached by URL before any product has loaded).
 *
 * Handles that are not listed fall back to title case, so a brand added to the catalogue
 * renders sensibly without a code change.
 */
const BRAND_DISPLAY_NAMES: Record<string, string> = {
  apple: "Apple",
  samsung: "Samsung",
  xiaomi: "Xiaomi",
  google: "Google",
  oppo: "OPPO",
  vivo: "vivo",
  realme: "realme",
  oneplus: "OnePlus",
  infinix: "Infinix",
  tecno: "Tecno",
  honor: "HONOR",
  nothing: "Nothing",
  motorola: "Motorola",
};

export function brandDisplayName(handle: string): string {
  return (
    BRAND_DISPLAY_NAMES[handle] ??
    handle
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
