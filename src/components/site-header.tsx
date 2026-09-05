import Link from "next/link";
import type { Route } from "next";
import { features } from "@/lib/features";
import { degradeGracefully } from "@/lib/log";
import { listBrands } from "@/lib/brands";
import { FonekistWordmark } from "./brand/logo";
import { NavLink } from "./nav-link";
import { SearchBox } from "./search-box";
import { QueryBadgeLink } from "./query-badge";
import { IconCalendar, IconCompare, IconHandset, IconTruck } from "./icons";

/**
 * Site header.
 *
 * Search is the widest thing in it. In a phone shop most visitors arrive knowing a model
 * name, and the previous header buried the field at the end of a row of five equal-weight
 * text links, which made looking something up the hardest thing on the page.
 *
 * The query count reads a cookie, which makes whatever renders it dynamic. It used to do
 * that on the server, isolated in a suspended component so it would be the only part of the
 * header affected. Even isolated it was too expensive: a dynamic hole in the header is a
 * dynamic hole in every page on the site, so no page could be static and none could be
 * cached by a CDN. It reads the count in the browser now instead; `components/query-badge`
 * has the reasoning and the measurement.
 *
 * The brand list is read through `degradeGracefully`: a header that throws takes down every
 * page, and a missing brand rail is not worth that.
 */
export async function SiteHeader() {
  const brands = await degradeGracefully("header.brands", [], () => listBrands());

  return (
    <header id="site-header" className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 sm:px-8">
        {/*
          The mark itself, not the name set in the body font. It inherits `--text`, so it is
          ink on the light scheme and paper on the dark one from the one file.
        */}
        <Link
          href="/"
          className="shrink-0 text-[var(--text)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-80"
        >
          <FonekistWordmark label="FONEKIST, home" className="h-9 w-auto sm:h-10" />
        </Link>

        {/* Order 3 on a phone: the field gets its own full-width row rather than a stub. */}
        <div className="order-3 w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1">
          <SearchBox />
        </div>

        {/*
          Visible at every width.

          This was `hidden lg:block`, so on a phone the header offered a search field and a
          cart button and nothing else: no Phones, no Track order, and no Installments. In a
          market that shops on a handset that hid the site's entire proposition from most of
          the people it was written for. Below `lg` it becomes a scroll rail on its own row,
          the same pattern the brand list below it already uses.
        */}
        <nav
          aria-label="Main"
          className="order-4 w-full lg:order-none lg:ml-auto lg:w-auto"
        >
          {/*
            The installments link was the site's only emerald nav item, which spent the trust
            colour on wayfinding (ADR-003). It is distinguished by weight and by its icon now,
            which is what ADR-001 asked for in the first place: anything needing emphasis
            earns it through weight, size or space rather than by borrowing the accent.
          */}
          <ul className="snap-rail items-center gap-x-1 text-sm font-medium lg:overflow-x-visible">
            <li className="shrink-0">
              <NavLink href="/phones" matchNested>
                <IconHandset />
                Phones
              </NavLink>
            </li>
            <li className="shrink-0">
              <NavLink href="/installments" matchNested>
                <IconCalendar />
                How it works
              </NavLink>
            </li>
            {features.comparison && (
              <li className="shrink-0">
                <NavLink href="/compare">
                  <IconCompare />
                  Compare
                </NavLink>
              </li>
            )}
            <li className="shrink-0">
              <NavLink href="/track">
                <IconTruck />
                Track order
              </NavLink>
            </li>
          </ul>
        </nav>

        {/*
          Client-side, so this header stays part of a static page. It renders without a
          number first and fills the count in immediately after, which is the same sequence
          the suspended server version produced: a link that says "0" before we have checked
          is a claim we have not checked yet.
        */}
        <QueryBadgeLink />
      </div>

      {brands.length > 0 && (
        <nav aria-label="Brands" className="border-t border-[var(--line)]">
          <ul className="snap-rail mx-auto max-w-6xl gap-x-1 px-5 py-2 text-sm sm:px-8">
            <li className="shrink-0">
              <Link href="/phones" className="nav-pill inline-flex items-center font-medium text-[var(--text)]">
                All phones
              </Link>
            </li>
            {brands.map((brand) => (
              <li key={brand.handle} className="shrink-0">
                <NavLink href={`/brands/${brand.handle}` as Route}>{brand.name}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
