import Link from "next/link";
import { formatPkr } from "@/lib/pk";
import { listBrands } from "@/lib/brands";
import { features } from "@/lib/features";
import { degradeGracefully } from "@/lib/log";
import { search } from "@/lib/search";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { HeroBanner, type HeroSlide } from "@/components/hero-banner";
import {
  BrandMosaic,
  type BrandTile,
  PillRail,
  Section,
  SectionHead,
  TrustStrip,
} from "@/components/storefront-blocks";
import { MonthlyExplorer } from "@/components/monthly-explorer";
import { PhoneFinder } from "@/components/phone-finder";
import { Eyebrow } from "@/components/brand/signal-arc";
import { FonekistMark } from "@/components/brand/logo";
import { IconChevronRight } from "@/components/icons";
import { dynamicRoute } from "@/lib/routes";

/**
 * Home.
 *
 * Reads the live catalogue rather than a fixture, which is what proves the whole chain:
 * every request carries the FONEKIST publishable key, and that key's sales channel holds
 * phones and nothing else (ADR-022). A laptop appearing on this page would mean the channel
 * assignment is wrong, and that is worth finding out here rather than in QA.
 *
 * Each band reads independently through `degradeGracefully`. A home page that throws
 * because one collection query failed is a shop that is closed; a home page missing one
 * band is a shop with a quiet shelf.
 *
 * The order is the sales order: banner, then trust, then brands, then goods, then the
 * installment promise, then browsing by budget. It used to open with a headline and three
 * paragraphs of explanation, which is a document, not a shop.
 *
 * What is deliberately absent, including from the designs this was modelled on: a
 * countdown, a carousel that moves on its own, star ratings, testimonials, a "trending"
 * rail derived from nothing, and any number that was not counted or configured.
 */
export const revalidate = 60;

const COLLECTIONS = [
  { label: "All phones", href: "/phones" },
  { label: "Under Rs 50,000", href: "/phones?price_max=50000&in_stock=1" },
  { label: "Under Rs 8,000 a month", href: "/phones?monthly_max=8000&installments=1" },
  { label: "Flagships", href: "/phones?price_min=150000&in_stock=1" },
  { label: "Big batteries", href: "/phones?attr.battery_mah.min=5000&in_stock=1" },
  { label: "In stock now", href: "/phones?in_stock=1" },
];

export default async function HomePage() {
  const [newest, byMonthly, dearest, brands, everything] = await Promise.all([
    degradeGracefully("home.newest", null, () =>
      search({ q: "", sort: "newest", perPage: 6, inStockOnly: true }),
    ),
    degradeGracefully("home.installments", null, () =>
      search({ q: "", sort: "price_asc", perPage: 24, installmentsOnly: true, inStockOnly: true }),
    ),
    degradeGracefully("home.flagship", null, () =>
      search({ q: "", sort: "price_desc", perPage: 1, inStockOnly: true }),
    ),
    degradeGracefully("home.brands", [], () => listBrands()),
    // One read, grouped below, rather than one query per brand tile.
    degradeGracefully("home.brandTiles", null, () =>
      search({ q: "", sort: "price_desc", perPage: 60 }),
    ),
  ]);

  const cheapestMonthly = byMonthly?.hits
    .map((hit) => hit.min_monthly_pkr)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)[0];

  const flagship = dearest?.hits[0] ?? null;
  const valuePick = byMonthly?.hits[0] ?? null;

  /*
   * Brand tiles.
   *
   * Each tile shows a handset the brand genuinely carries, taken from the catalogue. We
   * hold no brand logos and have no licence to use any, so a photograph of real stock is
   * both the honest option and the better-looking one.
   */
  const tiles: BrandTile[] = brands
    .map((brand) => {
      const hits = (everything?.hits ?? []).filter((hit) => hit.brand_handle === brand.handle);
      if (hits.length === 0) return null;
      const monthly = hits
        .map((hit) => hit.min_monthly_pkr)
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b)[0];
      return {
        handle: brand.handle,
        name: brand.name,
        thumbnail: hits.find((hit) => hit.thumbnail)?.thumbnail ?? null,
        fromMonthlyPkr: monthly ?? null,
        count: hits.length,
      };
    })
    .filter((tile): tile is BrandTile => tile !== null)
    .sort((a, b) => b.count - a.count);

  const slides: HeroSlide[] = [];

  if (flagship) {
    slides.push({
      eyebrow: "Flagship",
      headline: flagship.title,
      support: "PTA status, warranty and delivery stated before you buy.",
      image: "/media/editorial/hero-flagship.jpg",
      imageAlt: "",
      href: `/p/${flagship.slug}`,
      cta: "See this phone",
      pricePkr: flagship.price_pkr,
      compareAtPkr: flagship.compare_at_pkr,
      monthlyPkr: flagship.has_installments ? flagship.min_monthly_pkr : null,
    });
  }

  if (cheapestMonthly != null) {
    slides.push({
      eyebrow: "Installments",
      headline: "Pay monthly, and see the total first.",
      support:
        "Cash price, advance, monthly amount, total payable and the difference from cash. On one screen, before you apply.",
      image: "/media/editorial/hero-installments.jpg",
      imageAlt: "",
      href: dynamicRoute("/phones?installments=1"),
      cta: "Phones on installments",
      monthlyPkr: cheapestMonthly,
    });
  }

  if (valuePick) {
    slides.push({
      eyebrow: "Best value",
      headline: valuePick.title,
      support: "The lowest monthly plan we carry, on a handset that is in stock today.",
      image: "/media/editorial/hero-value.jpg",
      imageAlt: "",
      href: `/p/${valuePick.slug}`,
      cta: "See this phone",
      pricePkr: valuePick.price_pkr,
      compareAtPkr: valuePick.compare_at_pkr,
      monthlyPkr: valuePick.has_installments ? valuePick.min_monthly_pkr : null,
    });
  }

  return (
    <div>
      <HeroBanner slides={slides} />
      <TrustStrip />

      {tiles.length > 0 && (
        <Section labelledBy="brands-heading">
          <SectionHead
            id="brands-heading"
            title="Shop by brand"
            action={{ label: "All brands", href: "/brands" }}
          />
          <div className="mt-7">
            <BrandMosaic brands={tiles} />
          </div>
        </Section>
      )}

      {newest && newest.hits.length > 0 && (
        <Section labelledBy="new-heading">
          <SectionHead
            id="new-heading"
            title="Newest in stock"
            action={{ label: `All ${newest.total} phones`, href: "/phones" }}
          />
          <div className="mt-4">
            <PillRail items={COLLECTIONS} />
          </div>
          <div className="mt-7">
            <ProductGrid compare={features.comparison} products={newest.hits.map(hitToCard)} />
          </div>
        </Section>
      )}

      <section
        aria-labelledby="installments-heading"
        className="on-inverse relative overflow-hidden"
      >
        {/* The mark as texture, the same move the footer makes, so the two dark bands on
            the page belong to each other. */}
        <FonekistMark className="pointer-events-none absolute -left-24 -top-28 hidden h-[28rem] w-[28rem] text-[var(--on-inverse)] opacity-[0.04] lg:block" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <Eyebrow className="text-[var(--on-inverse-soft)]">Installments</Eyebrow>
              <h2
                id="installments-heading"
                className="mt-4 text-3xl font-semibold tracking-tight text-[var(--on-inverse)] sm:text-4xl"
              >
                The total is on the same screen as the monthly figure.
              </h2>
              {cheapestMonthly != null && (
                <p className="mt-5 text-lg text-[var(--on-inverse-soft)]">
                  Plans start at{" "}
                  <strong className="font-semibold text-[var(--on-inverse)]">
                    {formatPkr(cheapestMonthly)} a month
                  </strong>
                  .
                </p>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={dynamicRoute("/phones?installments=1")}
                  className="group inline-flex min-h-[48px] items-center gap-2 rounded-[var(--radius-chip)] bg-[var(--brand-paper)] px-7 text-sm font-semibold text-[var(--brand-ink)] transition-transform duration-300 [transition-timing-function:var(--ease-brand)] hover:scale-[1.02]"
                >
                  Phones on installments
                  <IconChevronRight className="transition-transform duration-300 [transition-timing-function:var(--ease-brand)] group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/policies/installments"
                  className="inline-flex min-h-[48px] items-center rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-7 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--on-inverse)]"
                >
                  Read the terms
                </Link>
              </div>
            </div>

            {/*
              The four figures, shown rather than described. This is the one promise the
              storefront is built around (INST-003, ADR-025), so it is stated as a list a
              reader can check rather than as a paragraph claiming we are transparent.
            */}
            <ul className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--line-strong)] sm:grid-cols-2">
              {[
                ["Cash price", "What the handset costs today"],
                ["Advance", "What you pay to take it home"],
                ["Monthly x tenure", "The arithmetic, printed out"],
                ["Total payable", "And how much more that is than cash"],
              ].map(([term, detail]) => (
                <li key={term} className="bg-[var(--surface-inverse)] p-6">
                  <p className="text-sm font-semibold text-[var(--on-inverse)]">{term}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--on-inverse-soft)]">{detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {byMonthly && byMonthly.hits.length > 0 && (
        <Section labelledBy="monthly-heading">
          <SectionHead id="monthly-heading" title="What fits your monthly budget" />
          <div className="mt-6">
            <MonthlyExplorer phones={byMonthly.hits.map(hitToCard)} />
          </div>
        </Section>
      )}

      {/*
        The finder stays, but at the foot of the page rather than a third of the way down
        it. Somebody who knows what they want has already left through the banner, the
        brands or the grid; this is for the reader who scrolled to the bottom without
        finding it, which is exactly who it was specified for.
      */}
      <Section labelledBy="finder-heading" className="border-t border-[var(--line)]">
        <SectionHead id="finder-heading" title="Not sure where to start" />
        <div className="mt-7 max-w-2xl">
          <PhoneFinder />
        </div>
      </Section>
    </div>
  );
}
