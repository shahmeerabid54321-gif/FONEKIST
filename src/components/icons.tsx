import type { ReactNode } from "react";

/**
 * The icon set.
 *
 * Drawn here rather than imported (ADR-003). A general-purpose library would have been
 * faster and would have added clarity without adding identity; these are drawn to the
 * logo's own proportions, and the wifi arc from the mark's O recurs through them so a row
 * of icons reads as belonging to this shop rather than to any shop.
 *
 * The constants below are the whole system. Every icon is on the same 24-unit grid at the
 * same stroke weight with the same joins, which is what makes them look like a set; an icon
 * that needs a different weight to read is a badly drawn icon, not an exception.
 *
 * Accessibility follows the decision `brand/logo.tsx` already made, deliberately reused
 * rather than reinvented: an icon is hidden from assistive technology unless it IS the
 * accessible name of its container. Almost every icon here sits beside a label that already
 * says the same word, and naming both makes a screen reader announce "delivery delivery".
 */

const SIZE = 24;
const STROKE = 1.75;

export interface IconProps {
  className?: string;
  /** The accessible name. Omit when adjacent text already names the thing. */
  label?: string;
}

function Icon({ label, className = "", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Icons scale with the type they sit beside unless a caller overrides it. `shrink-0`
      // because an icon squashed by a flex row is worse than no icon.
      className={`h-[1.15em] w-[1.15em] shrink-0 ${className}`}
      {...(label
        ? { role: "img" as const, "aria-label": label }
        : { "aria-hidden": true as const, focusable: false as const })}
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ The mark's own shapes */

/**
 * The signal arcs, straight off the logo's O.
 *
 * The house icon. It means connection, reach and progress depending on where it sits, and
 * it is the shape `SignalProgress` fills one arc at a time.
 */
export function IconSignal(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 9.5a13 13 0 0 1 17 0" />
      <path d="M6.5 13a8.5 8.5 0 0 1 11 0" />
      <path d="M9.5 16.5a4 4 0 0 1 5 0" />
      <circle cx="12" cy="20" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/**
 * The handset, leaning, with the bars rising out of it. The logo's K, on its own.
 *
 * The lean is 8 degrees, taken from the artwork rather than chosen, which is why it is
 * baked into the transform instead of left to a caller.
 */
export function IconHandset(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform="rotate(8 12 12)">
        <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
        <path d="M10.6 5.6h2.8" />
      </g>
    </Icon>
  );
}

/** A handset with the signal rising off it: the whole mark, at icon size. */
export function IconPhoneSignal(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="10" height="14.5" rx="2.2" />
      <path d="M6.2 9.8h3.6" />
      <path d="M15.5 12.5a4 4 0 0 0-.6-.5" />
      <path d="M16.2 8.6a7.4 7.4 0 0 1 4.3 4.3" />
      <path d="M15.8 4.2a11.8 11.8 0 0 1 8.2 8.2" transform="translate(-1.6 0.4) scale(0.92)" />
    </Icon>
  );
}

/* ------------------------------------------------------------------------- Commerce meaning */

/** PTA approval, warranty, anything verified by a third party. */
export function IconShieldCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.6 4.5 5.6v6.1c0 4.4 3 7.9 7.5 9.7 4.5-1.8 7.5-5.3 7.5-9.7V5.6Z" />
      <path d="M8.9 11.9 11.2 14.2 15.4 10" />
    </Icon>
  );
}

/** Installments: months, laid out. */
export function IconCalendar(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.2" y="4.8" width="17.6" height="16" rx="2.4" />
      <path d="M3.2 9.6h17.6M8 2.8v4M16 2.8v4" />
      <path d="M7.6 13.4h2M11 13.4h2M14.4 13.4h2M7.6 16.8h2M11 16.8h2" />
    </Icon>
  );
}

/** Stock on a shelf. */
export function IconBox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.6 7.9v8.2a1.6 1.6 0 0 1-.85 1.41l-7 3.83a1.6 1.6 0 0 1-1.5 0l-7-3.83A1.6 1.6 0 0 1 3.4 16.1V7.9a1.6 1.6 0 0 1 .85-1.41l7-3.83a1.6 1.6 0 0 1 1.5 0l7 3.83A1.6 1.6 0 0 1 20.6 7.9Z" />
      <path d="M3.6 7.1 12 11.9l8.4-4.8M12 21.2v-9.3" />
    </Icon>
  );
}

/** Delivery. */
export function IconTruck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.9 5.8h11.4v10.4H1.9z" />
      <path d="M13.3 9.6h3.9l3 3v3.6h-6.9z" />
      <circle cx="6.4" cy="18.4" r="1.9" />
      <circle cx="16.6" cy="18.4" r="1.9" />
      <path d="M8.3 18.4h6.4M1.9 16.2h2.6" />
    </Icon>
  );
}

/** Returns and exchanges. */
export function IconRotateLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 5.4v5.2h5.2" />
      <path d="M3.9 10.2a8.6 8.6 0 1 1 1.1 6.4" />
    </Icon>
  );
}

/** Cash, a price, anything paid in full. */
export function IconBanknote(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.4" y="6" width="19.2" height="12" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.2 12h.1M17.7 12h.1" />
    </Icon>
  );
}

/* -------------------------------------------------------------------------- Interface verbs */

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.8" cy="10.8" r="7.2" />
      <path d="m16.2 16.2 4.3 4.3" />
    </Icon>
  );
}

/**
 * The query.
 *
 * A shortlist on a clipboard, not a trolley. This site does not sell anything from a
 * basket: what a customer builds here is a handful of handsets and plans they are choosing
 * between, and a cart glyph would promise a checkout that does not exist.
 */
export function IconQuery(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3.4h6a1 1 0 0 1 1 1v1.2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z" />
      <path d="M16 5.4h1.9a1.9 1.9 0 0 1 1.9 1.9v12.3a1.9 1.9 0 0 1-1.9 1.9H6.1a1.9 1.9 0 0 1-1.9-1.9V7.3a1.9 1.9 0 0 1 1.9-1.9H8" />
      <path d="m8.4 12.4 1.6 1.6 3.2-3.2M8.4 17.6h7.2" />
    </Icon>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 5.6h17.2l-6.6 7.8v5.6l-4-2.3v-3.3z" />
    </Icon>
  );
}

export function IconSort(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.4 4.4v15.2m0 0-3-3m3 3 3-3" />
      <path d="M17.6 19.6V4.4m0 0-3 3m3-3 3 3" />
    </Icon>
  );
}

/** Two columns, side by side: comparison. */
export function IconCompare(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.8" y="4.4" width="7.2" height="15.2" rx="1.8" />
      <rect x="14" y="4.4" width="7.2" height="15.2" rx="1.8" />
      <path d="M10.6 12h2.8" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.6 12.4 5 5 9.8-10.8" />
    </Icon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 4.8 7.2 7.2L9 19.2" />
    </Icon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.8 9 12 16.2 19.2 9" />
    </Icon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.4 5.4l13.2 13.2M18.6 5.4 5.4 18.6" />
    </Icon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.8v14.4M4.8 12h14.4" />
    </Icon>
  );
}

/* ------------------------------------------------------------------------------ Reaching us */

export function IconPhone(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 16.9v2.6a1.7 1.7 0 0 1-1.87 1.7 17.2 17.2 0 0 1-7.5-2.67 17 17 0 0 1-5.2-5.2A17.2 17.2 0 0 1 3.76 5.8 1.7 1.7 0 0 1 5.45 3.9h2.6a1.7 1.7 0 0 1 1.7 1.46c.11.83.3 1.64.58 2.42a1.7 1.7 0 0 1-.38 1.79l-1.1 1.1a13.6 13.6 0 0 0 5.2 5.2l1.1-1.1a1.7 1.7 0 0 1 1.79-.38c.78.27 1.59.47 2.42.58A1.7 1.7 0 0 1 21 16.9Z" />
    </Icon>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.6" y="5" width="18.8" height="14" rx="2.2" />
      <path d="m3.2 6.6 8.8 6.2 8.8-6.2" />
    </Icon>
  );
}

/**
 * The chat bubble, for the WhatsApp handoff.
 *
 * Deliberately not WhatsApp's own glyph. Their mark is their trademark and putting it on a
 * button implies an integration we do not have: this opens the customer's own app with a
 * message written, which is a conversation, not a service.
 */
export function IconChat(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.2c-5.08 0-9.2 2.98-9.2 6.65 0 2.1 1.35 3.97 3.45 5.19v3.76l3.63-2.5c.68.11 1.4.17 2.12.17 5.08 0 9.2-2.98 9.2-6.62 0-3.67-4.12-6.65-9.2-6.65Z" />
    </Icon>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19.4 10.4c0 5.4-7.4 11.2-7.4 11.2s-7.4-5.8-7.4-11.2a7.4 7.4 0 1 1 14.8 0Z" />
      <circle cx="12" cy="10.2" r="2.7" />
    </Icon>
  );
}

/* --------------------------------------------------------------------------------- Notices */

export function IconInfo(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 16.6v-5.2M12 8.1h.01" />
    </Icon>
  );
}

export function IconWarning(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.55 3.9 2.3 18a1.7 1.7 0 0 0 1.45 2.55h16.5A1.7 1.7 0 0 0 21.7 18L13.45 3.9a1.7 1.7 0 0 0-2.9 0Z" />
      <path d="M12 9.4v4.2M12 17.2h.01" />
    </Icon>
  );
}

export function IconDocument(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.6 2.6H6.8a1.9 1.9 0 0 0-1.9 1.9v15a1.9 1.9 0 0 0 1.9 1.9h10.4a1.9 1.9 0 0 0 1.9-1.9V8Z" />
      <path d="M13.6 2.6V8h5.5M8.6 13.4h6.8M8.6 17h4.6" />
    </Icon>
  );
}
