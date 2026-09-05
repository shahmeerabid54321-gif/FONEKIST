"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

/**
 * A main-navigation link that knows whether it is the page you are on.
 *
 * The header had no current-page indication at all, which is a WCAG 2.4.8 miss and, more
 * plainly, the thing that made every page's chrome look identical. The marker is the brand
 * red dot (ADR-003): it is the ornament role that token exists for, and a 7px filled circle
 * clears the 3:1 that a non-text indicator needs where the colour itself could never carry
 * text at 3.6:1.
 *
 * Colour is never the only signal. `aria-current="page"` names it, the label goes to full
 * `--text` weight, and the dot is decoration on top of both.
 *
 * Hover and keyboard focus both fill the link with the brand red (`.nav-pill` in
 * `globals.css`), which is the same treatment every wayfinding link on the site now uses.
 *
 * A client component purely because `usePathname` is one. It is the only interactive part of
 * an otherwise server-rendered header, so the cost is one small leaf rather than the shell.
 *
 * **Why the boundary lives in here.** `usePathname` cannot resolve while Next is building a
 * static shell for a route with dynamic params, because at that point there is no single
 * pathname to report: it suspends, and an unsuspended read fails the build. This component
 * renders in the header of every page on the site, so a boundary at any call site would
 * have to be repeated at all of them and would be forgotten at the next one.
 *
 * Putting it here means the header ships in the prerendered shell in its resting state, and
 * the current-page marker arrives a moment later. That ordering is right on its own merits:
 * the marker is an enhancement, and the navigation is fully usable and fully legible
 * without it. The fallback is the same link, so nothing moves when the marker lands.
 */
export function NavLink(props: NavLinkProps) {
  return (
    <Suspense fallback={<NavAnchor {...props} current={false} />}>
      <CurrentAwareNavLink {...props} />
    </Suspense>
  );
}

interface NavLinkProps {
  href: Route;
  children: ReactNode;
  /** Also mark as current for routes below this one, e.g. /phones for /phones?brand=apple. */
  matchNested?: boolean;
  /** Pull the pill's padding back out, for a vertical column that must stay left aligned. */
  flush?: boolean;
}

function CurrentAwareNavLink({ href, matchNested = false, ...rest }: NavLinkProps) {
  const pathname = usePathname();
  const current = matchNested ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;

  return <NavAnchor href={href} matchNested={matchNested} {...rest} current={current} />;
}

function NavAnchor({
  href,
  children,
  flush = false,
  current,
}: NavLinkProps & { current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`nav-pill relative inline-flex items-center gap-2 ${flush ? "nav-pill-flush" : ""} ${
        current ? "font-semibold text-[var(--text)]" : "text-[var(--text-soft)]"
      }`}
    >
      {children}
      {current && (
        <span
          aria-hidden="true"
          // `nav-pill-mark` so it turns white with the label when the pill is red. A red
          // dot on a red pill is a marker that vanishes exactly when it is being pointed at.
          className="nav-pill-mark absolute bottom-[3px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[var(--brand-dot)]"
        />
      )}
    </Link>
  );
}
