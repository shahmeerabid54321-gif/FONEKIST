import { brandDisplayName, brandHandle } from "@/lib/pk";
import { listCategories, type MedusaCategory } from "./catalog";

/**
 * Brand navigation.
 *
 * Brands are Medusa product categories with a `brand-` handle prefix (ADR-026), not a
 * bespoke module. Everything a brand needs — handle, name, description, media, SEO, an
 * active flag — is already a category, and categories already drive routing and facets.
 *
 * The prefix is what separates a brand category from a type category ("smartphones") in a
 * single flat list, so `/brands/samsung` and `/phones` can share one categories read.
 */

const BRAND_PREFIX = "brand-";

export interface Brand {
  /** Canonical handle, e.g. "xiaomi". The URL segment and the filter value. */
  handle: string;
  name: string;
  description: string | null;
  categoryId: string;
}

function toBrand(category: MedusaCategory): Brand | null {
  if (!category.handle.startsWith(BRAND_PREFIX)) return null;
  const handle = category.handle.slice(BRAND_PREFIX.length);
  if (!handle) return null;
  return {
    handle,
    name: category.name || brandDisplayName(handle),
    description: category.description,
    categoryId: category.id,
  };
}

/** Every brand this storefront carries, alphabetical. */
export async function listBrands(): Promise<Brand[]> {
  const categories = await listCategories();
  return categories
    .map(toBrand)
    .filter((brand): brand is Brand => brand !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBrand(handle: string): Promise<Brand | null> {
  const normalised = brandHandle(handle);
  if (!normalised) return null;
  const brands = await listBrands();
  // Matched on the canonical handle, so `/brands/redmi` resolves to the Xiaomi page rather
  // than 404ing on a name customers genuinely use.
  return brands.find((brand) => brand.handle === normalised) ?? null;
}

export { brandDisplayName, brandHandle };
