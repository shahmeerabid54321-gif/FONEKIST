/**
 * Loading states.
 *
 * These are what a customer sees in the moment between clicking a link and the data
 * arriving. Before Cache Components there was no such moment on this site, because there was
 * nothing to see: every route rendered on the server in full, so the browser held the
 * previous page on screen until the whole thing was ready. A click did nothing visible for
 * as long as commerce took to answer, which reads as a broken site rather than a busy one.
 *
 * Two rules shape all of them.
 *
 * **They occupy the space the real thing will.** Every skeleton here matches the grid,
 * aspect ratio and rhythm of the component it stands in for, so when content lands it
 * replaces the placeholder in place rather than shoving the page around. Layout shift while
 * loading is worse than a blank space, and CLS is part of the Definition of Done.
 *
 * **They state nothing.** No counts, no prices, no "loading 24 phones". A placeholder that
 * makes a claim is a claim we have not checked, and every figure on this site is supposed to
 * come from commerce. These are shapes.
 *
 * The pulse is a single opacity animation, and `motion-safe:` means a customer who has asked
 * their system for reduced motion gets the shape and no movement.
 *
 * Each placeholder carries `role="status"` with a label. The role is not decoration: an
 * `aria-label` on an element with no role at all is prohibited by ARIA and axe fails the
 * page for it, and more importantly a screen reader given a box of empty divs has no way to
 * know that anything is happening. `status` announces politely, once, and does not steal
 * focus.
 */

function Block({ className }: { className: string }) {
  return (
    <div
      className={`motion-safe:animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-tile)] ${className}`}
    />
  );
}

/** One listing tile: square image, then the two or three lines of text under it. */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <Block className="aspect-square w-full" />
      <div className="mt-4 flex flex-col gap-2">
        <Block className="h-4 w-3/4 rounded-[var(--radius-chip)]" />
        <Block className="h-4 w-1/2 rounded-[var(--radius-chip)]" />
        <Block className="h-5 w-2/5 rounded-[var(--radius-chip)]" />
      </div>
    </div>
  );
}

/**
 * A grid of them, on the same breakpoints as `ProductGrid`.
 *
 * Six by default rather than the twenty-four a full page holds: the fallback only has to
 * cover the fold, and drawing eighteen placeholders nobody scrolls to is work the browser
 * does instead of painting the ones they can see.
 */
export function CatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul
      // Named for a screen reader, which otherwise announces nothing at all here and leaves
      // somebody who cannot see the shapes with no indication that anything is happening.
      aria-busy="true"
      aria-label="Loading phones"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <ProductCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

/** The catalogue page's left rail, so the two-column layout holds while results load. */
export function FilterPanelSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading filters" className="flex flex-col gap-4">
      <Block className="h-6 w-2/3 rounded-[var(--radius-chip)]" />
      <Block className="h-32 w-full" />
      <Block className="h-32 w-full" />
    </div>
  );
}

/**
 * The product page: gallery on one side, the buying column on the other.
 *
 * Mirrors the PDP's `lg:grid-cols-2` so the fold does not reflow when the real thing lands.
 */
export function ProductSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading this phone"
      className="grid gap-10 lg:grid-cols-2"
    >
      <Block className="aspect-square w-full" />
      <div className="flex flex-col gap-4">
        <Block className="h-8 w-4/5 rounded-[var(--radius-chip)]" />
        <Block className="h-6 w-1/3 rounded-[var(--radius-chip)]" />
        <Block className="h-24 w-full" />
        <Block className="h-40 w-full" />
      </div>
    </div>
  );
}

/**
 * The plan panel and its disclosure.
 *
 * Deliberately tall: the disclosure carries five figures and a comparison (INST-003), and a
 * short placeholder that grows into a tall block would push the page down under the reader.
 */
export function PlanSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading installment plans" className="flex flex-col gap-3">
      <Block className="h-12 w-full" />
      <Block className="h-12 w-full" />
      <Block className="h-32 w-full" />
    </div>
  );
}

/** A single row of the query or a short list of rows elsewhere. */
export function RowSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, index) => (
        <Block key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}
