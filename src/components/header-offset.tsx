"use client";

import { useEffect } from "react";

/**
 * Publishes the site header's height as `--header-h`.
 *
 * Anything else on a page that wants to be sticky has to clear the header, and the header
 * is not one height: it grows when the search field wraps onto its own row on a phone, and
 * it shrinks when the brand rail is absent because the catalogue failed to load. A constant
 * in a stylesheet is wrong in at least one of those cases, and the way it is wrong is that
 * the sticky thing hides underneath the header, which is exactly the bug this fixes.
 *
 * It writes a custom property rather than positioning anything itself, so a caller stays
 * declarative: `top-[var(--header-h)]`.
 *
 * There is a real fallback in `globals.css`, so with JavaScript off, or before this runs,
 * every sticky element still clears a plausible header rather than sitting at the top of
 * the viewport. This only ever refines that value.
 */
export function HeaderOffset() {
  useEffect(() => {
    const header = document.getElementById("site-header");
    if (!header || typeof ResizeObserver === "undefined") return;

    const publish = () => {
      document.documentElement.style.setProperty(
        "--header-h",
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return null;
}
