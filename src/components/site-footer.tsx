import Link from "next/link";
import type { Route } from "next";
import { listBrands } from "@/lib/brands";
import { publicEnv } from "@/lib/env";
import { features } from "@/lib/features";
import { degradeGracefully } from "@/lib/log";
import { POLICIES } from "@/lib/policies";
import { FonekistLockup, FonekistMark } from "./brand/logo";
import { Eyebrow } from "./brand/signal-arc";
import {
  IconCalendar,
  IconCompare,
  IconDocument,
  IconHandset,
  IconMail,
  IconPhone,
  IconRotateLeft,
  IconShieldCheck,
  IconSignal,
  IconTruck,
  IconWarning,
} from "./icons";

/*
 * One icon per link, and each one means the thing beside it.
 *
 * The icons are hidden from assistive technology (see `icons.tsx`): the link text already
 * says "Track an order", and naming the truck as well would have a screen reader announce
 * the same idea twice. They are here for the sighted scan down a column of eleven links,
 * which is the thing a wall of identical grey text is worst at.
 */
const POLICY_ICON: Record<string, typeof IconDocument> = {
  installments: IconCalendar,
  returns: IconRotateLeft,
  warranty: IconShieldCheck,
  pta: IconShieldCheck,
  delivery: IconTruck,
};

/**
 * Site footer.
 *
 * The last thing on every page, and until now the weakest: four columns of grey links on a
 * pale band, which ended the page by fading out. It is dark now, so scrolling to the bottom
 * arrives somewhere rather than running out of page, and it carries the two things a
 * customer at the foot of a shop actually wants: a way back into the catalogue by brand,
 * and a way to reach a person.
 *
 * Every claim here is either configured or true by construction. There is no "10,000 happy
 * customers", no rating, no delivery promise beyond what the delivery policy itself makes,
 * and no newsletter box, because we cannot count the first two, cannot control the third,
 * and have nowhere to send the fourth. A signup form that discards the address is worse
 * than no form.
 *
 * Support details render only when configured. An empty phone number would print as a dead
 * link, which is worse than not offering one.
 *
 * The band was a green-black (`--color-deep`) and is the logo's own black now (ADR-003).
 * The mark was drawn on that black, so this is the one place on the site where the brand is
 * shown in the conditions it was designed for, and it is worth giving it the room: the
 * lockup runs large, the wifi disc bleeds off the corner behind it, and the eyebrow carries
 * the red dot.
 */
export async function SiteFooter() {
  const policies = Object.values(POLICIES);

  // A footer that throws takes down every page it sits on, and a missing brand rail is not
  // worth that.
  const brands = await degradeGracefully("footer.brands", [], () => listBrands());

  return (
    <footer className="on-inverse relative mt-24 overflow-hidden border-t border-[var(--line)]">
      {/*
        The wifi disc, oversized and bled off the corner.

        Decoration, and marked as such: it carries no information and sits at an opacity
        where it reads as texture on the band rather than as something to press. This is the
        one place on the site where the mark is used as a graphic rather than as the logo,
        which is what keeps it from becoming wallpaper.
      */}
      <FonekistMark className="pointer-events-none absolute -bottom-32 -right-20 hidden h-[26rem] w-[26rem] text-[var(--on-inverse)] opacity-[0.045] sm:block" />

      {brands.length > 0 && (
        <div className="border-b border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
            <Eyebrow className="text-[var(--on-inverse-soft)]">Shop by brand</Eyebrow>
            <ul className="mt-4 flex flex-wrap gap-x-2.5 gap-y-2.5">
              {brands.map((brand) => (
                <li key={brand.handle}>
                  <Link
                    href={`/brands/${brand.handle}` as Route}
                    className="nav-pill inline-flex min-h-[40px] items-center border border-[var(--line-strong)] px-4 text-sm text-[var(--text-soft)] hover:border-[var(--brand-dot-strong)]"
                  >
                    {brand.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
        <div>
          {/*
            The tagline rides with the logo only where the offer it names is switched on.
            With installments off, "buy now, pay later" advertises a page the site will not
            show, which is the sort of claim ADR-025 exists to prevent.
          */}
          <FonekistLockup
            label="FONEKIST"
            tagline
            className="h-auto w-60 text-[var(--on-inverse)]"
          />
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-[var(--text-soft)]">
            Phones in Pakistan with PTA status, warranty and delivery stated on every
            listing.
          </p>

          <Link
            href="/installments"
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-chip)] bg-[var(--on-inverse)] px-6 text-sm font-semibold text-[var(--surface-inverse)] transition-transform duration-200 [transition-timing-function:var(--ease-brand)] hover:scale-[1.02]"
          >
            <IconCalendar />
            How installments work
          </Link>
        </div>

        <nav aria-labelledby="footer-shop">
          <h2 id="footer-shop" className="text-sm font-semibold text-[var(--text)]">
            Shop
          </h2>
          <ul className="mt-4 space-y-0.5 text-sm">
            <li>
              <Link href="/phones" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                <IconHandset />
                All phones
              </Link>
            </li>
            <li>
              <Link href="/brands" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                <IconSignal />
                Brands
              </Link>
            </li>
            {features.comparison && (
              <li>
                <Link href="/compare" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                  <IconCompare />
                  Compare phones
                </Link>
              </li>
            )}
            <li>
              <Link href="/track" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                <IconTruck />
                Track an order
              </Link>
            </li>
            <li>
              <Link href="/installments/status" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                <IconDocument />
                Check an application
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-policies">
          <h2 id="footer-policies" className="text-sm font-semibold text-[var(--text)]">
            Policies
          </h2>
          <ul className="mt-4 space-y-0.5 text-sm">
            {policies.map((policy) => {
              const Icon = POLICY_ICON[policy.slug] ?? IconDocument;
              return (
                <li key={policy.slug}>
                  <Link
                    href={`/policies/${policy.slug}` as Route}
                    className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]"
                  >
                    <Icon />
                    {policy.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Help</h2>
          {/*
            The contact details are optional configuration, and on a deployment that has not
            set them this column used to be one warning line under a heading, which reads as
            a broken column rather than a deliberate one. The two self-service routes are
            always here, and the phone and email join them when they exist.
          */}
          <ul className="mt-4 space-y-0.5 text-sm">
            {publicEnv.NEXT_PUBLIC_SUPPORT_PHONE && (
              <li>
                <a
                  href={`tel:${publicEnv.NEXT_PUBLIC_SUPPORT_PHONE}`}
                  className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-lg font-semibold text-[var(--text)]"
                >
                  <IconPhone />
                  {publicEnv.NEXT_PUBLIC_SUPPORT_PHONE}
                </a>
              </li>
            )}
            {publicEnv.NEXT_PUBLIC_SUPPORT_EMAIL && (
              <li>
                <a
                  href={`mailto:${publicEnv.NEXT_PUBLIC_SUPPORT_EMAIL}`}
                  className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]"
                >
                  <IconMail />
                  {publicEnv.NEXT_PUBLIC_SUPPORT_EMAIL}
                </a>
              </li>
            )}
            <li>
              <Link href="/track" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                <IconTruck />
                Where is my order
              </Link>
            </li>
            <li>
              <Link href="/policies/returns" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                <IconRotateLeft />
                Return or exchange something
              </Link>
            </li>
            <li>
              <Link href="/policies/pta" className="nav-pill nav-pill-flush inline-flex items-center gap-2.5 text-[var(--text-soft)]">
                <IconShieldCheck />
                What PTA approval means
              </Link>
            </li>
          </ul>

          {/*
            The one warning worth putting in a footer in this market. Phone fraud against
            buyers waiting on a delivery is common enough that stating the rule where every
            page ends is worth the space.
          */}
          <p className="mt-5 flex gap-3 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-soft)]">
            <IconWarning className="mt-0.5 text-[var(--color-amber)]" />
            <span>We never ask for card, bank or OTP details by phone.</span>
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-6 text-xs text-[var(--text-muted)] sm:px-8">
          <p>Prices in Pakistani rupees, inclusive of applicable duty unless a listing says otherwise.</p>
          <p>Delivery is charged and is quoted before anything is dispatched.</p>
        </div>
      </div>
    </footer>
  );
}
