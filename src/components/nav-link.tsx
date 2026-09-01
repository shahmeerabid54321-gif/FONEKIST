"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
 */
export function NavLink({
  href,
  children,
  /** Also mark as current for routes below this one, e.g. /phones for /phones?brand=apple. */
  matchNested = false,
  /** Pull the pill's padding back out, for a vertical column that must stay left aligned. */
  flush = false,
}: {
  href: Route;
  children: ReactNode;
  matchNested?: boolean;
  flush?: boolean;
}) {
  const pathname = usePathname();
  const current = matchNested ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;

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
