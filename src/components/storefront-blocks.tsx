import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { mediaUrl } from "@/lib/media";
import { BrandPip, SignalArc } from "./brand/signal-arc";
import { IconBanknote, IconCalendar, IconChevronRight, IconShieldCheck, IconTruck } from "./icons";

/**
 * The repeating furniture of the storefront: section headings, the trust strip, the brand
 * mosaic, and the category rail.
 *
 * These live together because they are one decision, not four. The old pages each invented
 * their own heading, their own spacing and their own paragraph of explanation underneath,
 * which is most of why the site read as cluttered: eight sections, eight different rhythms,
 * and a block of grey helper text between every one of them and the goods.
 */

/**
 * A section heading.
 *
 * `action` is a link to the fuller list, on the same line. There is deliberately no slot
 * for a paragraph: if a section needs a sentence to explain what it is, the heading is
 * wrong. The one exception on the site is the installments band, which is making a specific
 * promise about disclosure and has its own layout.
 */
export function SectionHead({
  title,
  action,
  align = "start",
  id,
}: {
  title: string;
  action?: { label: string; href: string };
  align?: "start" | "center";
  id?: string;
}) {
  if (align === "center") {
    return (
      <div className="text-center">
        <BrandPip className="mb-3" />
        <h2 id={id} className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
          {title}
        </h2>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <h2
        id={id}
        className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl"
      >
        {/*
          The red pip (ADR-003). It is the only ornament on the site and it appears at the
          head of every band, which is what makes a page read as designed around the mark
          rather than as a stack of unrelated sections. It carries no information, so it is
          hidden from assistive technology and the heading is announced as its text alone.
        */}
        <BrandPip />
        {title}
      </h2>
      {action && (
        <Link
          href={action.href as Route}
          className="nav-pill group inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-soft)]"
        >
          {action.label}
          <IconChevronRight className="transition-transform duration-300 [transition-timing-function:var(--ease-brand)] group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/** Standard section padding, so every band on the site sits on the same rhythm. */
export function Section({
  children,
  labelledBy,
  className = "",
}: {
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16 ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * The trust strip under the banner.
 *
 * Four claims, and each one is true and checkable. The references put "Free Shipping" and
 * "24/7 Care" here; delivery is charged and nobody is staffed at night, so neither appears.
 * A row of reassurances that a customer can disprove on their first order costs more trust
 * than it buys.
 */
const TRUST: { label: string; detail: string; Icon: typeof IconShieldCheck }[] = [
  { label: "PTA status stated", detail: "On every listing, before you buy", Icon: IconShieldCheck },
  { label: "Warranty recorded", detail: "Terms saved against your order", Icon: IconCalendar },
  { label: "Cash on delivery", detail: "Available in most cities", Icon: IconBanknote },
  { label: "Total shown upfront", detail: "Every plan, before you apply", Icon: IconTruck },
];

export function TrustStrip() {
  return (
    <div className="border-y border-[var(--line)] bg-[var(--surface-sunken)]">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-5 py-6 sm:px-8 lg:grid-cols-4">
        {TRUST.map((item) => (
          <li key={item.label} className="flex gap-3">
            {/*
              Hidden from assistive technology: the label beside it already says "PTA status
              stated", and naming the shield as well would announce the claim twice.
            */}
            <item.Icon className="mt-0.5 h-5 w-5 text-[var(--text-soft)]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">{item.label}</p>
              <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BrandTile {
  handle: string;
  name: string;
  /** A photograph of a handset this brand actually sells, or null if it has no imagery. */
  thumbnail: string | null;
  /** The cheapest monthly plan across the brand, when it has one. */
  fromMonthlyPkr: number | null;
  count: number;
}

/**
 * The brand mosaic.
 *
 * Brand navigation used to be a row of text chips, which is a table of contents. Customers
 * in this market shop brand-first, so brand is the second most important thing on the page
 * after the banner, and it gets pictures and space.
 *
 * The first tile is twice the size because the mosaic has to have a shape; the rest are
 * even. The photograph on each tile is a handset that brand genuinely carries, pulled from
 * the catalogue rather than from a folder of logos we do not have the rights to.
 */
export function BrandMosaic({ brands }: { brands: BrandTile[] }) {
  if (brands.length === 0) return null;

  const [feature, ...rest] = brands;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <BrandCard brand={feature!} feature />
      {rest.slice(0, 8).map((brand) => (
        <BrandCard key={brand.handle} brand={brand} />
      ))}
    </div>
  );
}

function BrandCard({ brand, feature = false }: { brand: BrandTile; feature?: boolean }) {
  const thumbnail = mediaUrl(brand.thumbnail);

  return (
    <Link
      href={`/brands/${brand.handle}` as Route}
      className={`group relative flex flex-col justify-end overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-tile)] p-5 transition-shadow hover:shadow-[var(--shadow-lift)] ${
        feature ? "min-h-[22rem] sm:col-span-2 sm:row-span-2 lg:min-h-[30rem]" : "min-h-[14rem]"
      }`}
    >
      {thumbnail && (
        <Image
          src={thumbnail}
          alt=""
          fill
          sizes={feature ? "(max-width: 640px) 90vw, 45vw" : "(max-width: 640px) 90vw, 25vw"}
          className="tile-media object-cover"
        />
      )}
      {/* Same reason as the banner: the tile has to hold white type over an unknown photo. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[var(--surface-inverse)] via-[var(--surface-inverse)]/55 to-transparent"
      />
      {/*
        The arc lights up on hover. It is the logo's shape used as the affordance, which is
        cheaper than a border and says whose tile this is.
      */}
      <SignalArc
        filled={3}
        className="absolute right-5 top-5 h-6 w-6 text-white opacity-0 transition-opacity duration-300 [transition-timing-function:var(--ease-brand)] group-hover:opacity-70"
      />
      <div className="relative">
        <p
          className={`font-semibold tracking-tight text-white ${feature ? "text-3xl" : "text-xl"}`}
        >
          {brand.name}
        </p>
        <p className="mt-1 text-[13px] text-white/75">
          {brand.count} {brand.count === 1 ? "model" : "models"}
          {brand.fromMonthlyPkr != null
            ? ` · from Rs ${brand.fromMonthlyPkr.toLocaleString("en-PK")} a month`
            : ""}
        </p>
      </div>
    </Link>
  );
}

/**
 * The category rail: a row of filter pills that reads as browsing rather than as a form.
 *
 * Each pill is an ordinary link to a filtered `/phones`, so the state lives in the URL and
 * is shareable, bookmarkable and reachable with the back button, exactly like the filter
 * panel it sits above.
 */
export function PillRail({
  items,
  current,
}: {
  items: { label: string; href: string }[];
  current?: string;
}) {
  return (
    <ul className="snap-rail -mx-5 flex gap-2.5 px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((item) => {
        const active = item.href === current;
        return (
          <li key={item.href} className="shrink-0 basis-auto">
            <Link
              href={item.href as Route}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-5 text-sm font-medium text-[var(--surface)]"
                  : "nav-pill inline-flex min-h-[44px] items-center bg-[var(--surface-tile)] px-5 text-sm font-medium text-[var(--text-soft)]"
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
