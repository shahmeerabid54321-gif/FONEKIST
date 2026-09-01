import type { Route } from "next";

/**
 * Asserts that a URL built at runtime is a real route.
 *
 * `typedRoutes` verifies literal hrefs at build time, which catches links to pages that do
 * not exist — genuinely useful. It cannot verify a string assembled from filter state, so
 * those go through this one function rather than a cast scattered across components. The
 * assertion is narrow on purpose: keeping it in a single place means the type escape hatch
 * is auditable, and every caller is building a path from a known base plus a query string.
 */
export function dynamicRoute(path: string): Route {
  return path as Route;
}
