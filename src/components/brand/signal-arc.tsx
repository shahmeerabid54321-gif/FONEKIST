import type { ReactNode } from "react";

/**
 * The signal arc, and the progress track built out of it.
 *
 * The logo's most ownable shape is the three concentric arcs of the wifi disc, and an arc
 * that fills one ring at a time is what a progress indicator wants to be anyway (ADR-003).
 * So there is one shape here and it does four jobs: the pip on a section head, the node on
 * a step track, the marker on an active nav item, and the texture on a dark band.
 *
 * Before this, four flows each invented their own step display: the phone finder printed
 * "Step 1 of 3" as grey text, the application had nothing, checkout had nothing, and order
 * tracking drew its own list. They share this now, which is most of what makes the site
 * read as one piece of work.
 */

interface ArcProps {
  className?: string;
  /** How many of the three rings are lit, 0 to 3. */
  filled?: number;
  /** The accessible name. Omit when adjacent text already names the thing. */
  label?: string;
}

/**
 * The three arcs and the dot.
 *
 * The unlit rings stay on the page at low opacity rather than being removed, because a
 * meter that shows only what you have done cannot show how much is left.
 */
export function SignalArc({ className = "", filled = 3, label }: ArcProps) {
  const rings = [
    { d: "M3.5 9.5a13 13 0 0 1 17 0", at: 3 },
    { d: "M6.5 13a8.5 8.5 0 0 1 11 0", at: 2 },
    { d: "M9.5 16.5a4 4 0 0 1 5 0", at: 1 },
  ];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className={`h-[1.15em] w-[1.15em] shrink-0 ${className}`}
      {...(label
        ? { role: "img" as const, "aria-label": label }
        : { "aria-hidden": true as const, focusable: false as const })}
    >
      {rings.map((ring) => (
        <path
          key={ring.d}
          d={ring.d}
          className="transition-opacity duration-500 [transition-timing-function:var(--ease-brand)]"
          opacity={filled >= ring.at ? 1 : 0.22}
        />
      ))}
      <circle cx="12" cy="20" r="1.1" fill="currentColor" stroke="none" opacity={filled > 0 ? 1 : 0.22} />
    </svg>
  );
}

/**
 * The small red pip that marks a section head or an active nav item.
 *
 * This is `--brand-dot`'s ornamental role from ADR-003, and it is a shape rather than text
 * precisely because the colour is 3.6:1 on paper: legal for a filled shape, illegal for
 * type. It carries no information, so it is hidden from assistive technology.
 */
export function BrandPip({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--brand-dot)] ${className}`}
    />
  );
}

/**
 * An eyebrow with the pip in front of it.
 *
 * `.brand-eyebrow` came off the logo's tagline in ADR-002 and is already the site's one
 * typographic idea. Pairing it with the dot is what turns a small grey label into something
 * that could only belong to this shop.
 */
export function Eyebrow({
  children,
  className = "",
  pip = true,
}: {
  children: ReactNode;
  className?: string;
  pip?: boolean;
}) {
  return (
    <p className={`brand-eyebrow flex items-center gap-2.5 text-[var(--text-muted)] ${className}`}>
      {pip && <BrandPip />}
      {children}
    </p>
  );
}

export interface Step {
  /** The label a customer reads, and the one a screen reader announces. */
  label: string;
  /** Optional second line: a date on a tracking step, a hint on a form step. */
  detail?: string;
}

/**
 * A step track.
 *
 * Used by the phone finder, the credit application, checkout and order tracking. Every one
 * of those renders a position the system actually holds (ADR-003): which question you are
 * on, which section is complete, which courier state the order has reached. None of it is
 * a score and none of it is invented.
 *
 * Three things make it accessible rather than decorative:
 *
 *  - It is an ordered list, so the count and the order are structural rather than visual.
 *  - `aria-current="step"` names the position, and every step carries its label as text, so
 *    the state never depends on the colour of a node alone (WCAG 1.4.1).
 *  - `announce` adds a live region for the flows where pressing a button silently advances
 *    the track. A tracking page is static and does not get one, because a live region that
 *    never changes is noise.
 */
export function SignalProgress({
  steps,
  current,
  complete = false,
  orientation = "horizontal",
  announce = false,
  className = "",
}: {
  steps: readonly Step[];
  /** Zero-based index of the step in progress. */
  current: number;
  /** Every step is done, including the current one. */
  complete?: boolean;
  orientation?: "horizontal" | "vertical";
  announce?: boolean;
  className?: string;
}) {
  const vertical = orientation === "vertical";

  return (
    <div className={className}>
      {announce && (
        <p className="sr-only" aria-live="polite">
          Step {Math.min(current + 1, steps.length)} of {steps.length}:{" "}
          {steps[Math.min(current, steps.length - 1)]?.label}
        </p>
      )}

      <ol className={vertical ? "space-y-0" : "flex items-start gap-2"}>
        {steps.map((step, index) => {
          const done = complete ? true : index < current;
          const active = !complete && index === current;
          const last = index === steps.length - 1;

          return (
            <li
              key={step.label}
              aria-current={active ? "step" : undefined}
              className={vertical ? "relative flex gap-4 pb-6 last:pb-0" : "flex-1"}
            >
              {/*
                The rail. Drawn behind the node rather than between nodes, so it cannot
                fall out of alignment when a label wraps to two lines.
              */}
              {vertical && !last && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px ${
                    done ? "bg-[var(--text)]" : "bg-[var(--line)]"
                  }`}
                />
              )}

              <div className={vertical ? "shrink-0" : "flex items-center gap-2"}>
                <Node done={done} active={active} />
                {!vertical && !last && (
                  <span
                    aria-hidden="true"
                    className={`h-px flex-1 transition-colors duration-500 [transition-timing-function:var(--ease-brand)] ${
                      done ? "bg-[var(--text)]" : "bg-[var(--line)]"
                    }`}
                  />
                )}
              </div>

              <div className={vertical ? "min-w-0 pt-0.5" : "mt-2.5"}>
                <p
                  className={`text-[13px] leading-snug ${
                    done || active
                      ? "font-medium text-[var(--text)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {step.label}
                </p>
                {step.detail && (
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                    {step.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * One node on the track.
 *
 * Done is a filled disc with a tick, in progress is the signal arc ringed in the brand red,
 * and still to come is a hairline circle. The arc is the point: the thing that says "you
 * are here" is the shape off the logo rather than a generic dot.
 */
function Node({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full bg-[var(--text)] text-[var(--surface)]">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
          <path
            d="m4.6 12.4 5 5 9.8-10.8"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (active) {
    return (
      <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full border-2 border-[var(--brand-dot)] text-[var(--text)]">
        <SignalArc filled={3} className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full border border-[var(--line-strong)] text-[var(--text-muted)]">
      <SignalArc filled={0} className="h-4 w-4" />
    </span>
  );
}

/**
 * A meter.
 *
 * Used for the affordability explorer and for how far a plan's total sits above the cash
 * price. It illustrates a figure that is already stated in words next to it and never
 * replaces one, which is the line ADR-025 draws: a bar is not a disclosure.
 *
 * It is `aria-hidden` for exactly that reason. The numbers it draws are already in the
 * text, and announcing "62 per cent" with no unit attached tells a screen reader user less
 * than the sentence beside it already did.
 */
export function Meter({
  value,
  tone = "neutral",
  className = "",
}: {
  /** 0 to 1. Clamped, because a plan can exceed a scale and a bar cannot. */
  value: number;
  tone?: "neutral" | "trust" | "caution";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill =
    tone === "trust"
      ? "bg-[var(--color-emerald)]"
      : tone === "caution"
        ? "bg-[var(--color-amber)]"
        : "bg-[var(--text)]";

  return (
    <span
      aria-hidden="true"
      className={`block h-1.5 overflow-hidden rounded-[var(--radius-chip)] bg-[var(--line)] ${className}`}
    >
      <span
        className={`block h-full rounded-[var(--radius-chip)] transition-[width] duration-500 [transition-timing-function:var(--ease-brand)] ${fill}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
