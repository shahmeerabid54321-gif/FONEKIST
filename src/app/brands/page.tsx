import type { Metadata } from "next";
import Link from "next/link";
import { listBrands } from "@/lib/brands";

export const metadata: Metadata = {
  title: "Brands",
  description: "Every phone brand FONEKIST carries.",
};

export const revalidate = 300;

/**
 * The brand directory.
 *
 * Brands are Medusa product categories with a `brand-` handle prefix (ADR-026), and they
 * are keyed on the canonical handle, so Redmi and POCO appear under Xiaomi rather than as
 * two more near-empty pages beside it.
 */
export default async function BrandsPage() {
  const brands = await listBrands();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Brands</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-soft)]">
          Sub-brands are grouped with their manufacturer, so Redmi and POCO handsets appear
          under Xiaomi rather than on pages of their own.
        </p>
      </header>

      {brands.length === 0 ? (
        <p className="mt-10 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-8 text-[var(--text-soft)]">
          No brands are listed yet.
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <li key={brand.handle}>
              <Link
                href={`/brands/${brand.handle}`}
                className="flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-raised)] p-6 transition-colors hover:border-[var(--line-strong)]"
              >
                <h2 className="text-lg font-medium text-[var(--text)]">{brand.name}</h2>
                {brand.description && (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">
                    {brand.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
