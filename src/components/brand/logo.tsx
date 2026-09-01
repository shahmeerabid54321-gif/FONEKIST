import {
  MARK_PATH,
  MARK_VIEW_BOX,
  SUBMARK_PATH,
  SUBMARK_VIEW_BOX,
  TAGLINE_PATH,
  TAGLINE_VIEW_BOX,
  WORDMARK_DOT_PATH,
  WORDMARK_PATH,
  WORDMARK_VIEW_BOX,
} from "./logo-paths";

/**
 * The logo.
 *
 * The artwork was supplied as white-on-black raster, which is a logo that only works in one
 * place. These render the same shapes as vector paths filled with `currentColor`, so the
 * mark takes the colour of whatever it sits in: ink on the light scheme, paper on the dark
 * one, white on the hero band, with no second file and no `<img>` that has to guess.
 *
 * The dot over the i is the one exception and is always the brand red. It is the only red
 * on the site that does not mean a failure, which is why it is its own token
 * (`--brand-dot`) rather than `--color-danger`: the two must never be confused, and a
 * component reaching for the danger colour must not accidentally get the brand one.
 *
 * Naming: pass `label` when the mark IS the accessible name of its container, such as the
 * home link in the header. Leave it off when there is already text beside it, in which case
 * the svg is hidden from assistive technology rather than read out twice.
 */

interface MarkProps {
  className?: string;
  /** The accessible name. Omit when adjacent text already names the thing. */
  label?: string;
}

function a11y(label: string | undefined) {
  return label
    ? ({ role: "img" as const, "aria-label": label })
    : ({ "aria-hidden": true as const, focusable: false as const });
}

/**
 * FONEKIST, with the wifi disc, the handset and the dot. The primary signature.
 *
 * `overflow-visible` is deliberate: the handset leans past the top of the traced box by a
 * fraction of a unit, and a clipped corner on the phone is the kind of detail that makes a
 * logo look reproduced rather than placed.
 */
export function FonekistWordmark({ className = "", label }: MarkProps) {
  return (
    <svg
      viewBox={WORDMARK_VIEW_BOX}
      className={`overflow-visible ${className}`}
      {...a11y(label)}
    >
      <path fill="currentColor" fillRule="evenodd" d={WORDMARK_PATH} />
      <path className="fonekist-dot" fill="var(--brand-dot)" fillRule="evenodd" d={WORDMARK_DOT_PATH} />
    </svg>
  );
}

/**
 * BUY NOW, PAY LATER, set in the logo's own letterforms rather than re-typed.
 *
 * Kept separate from the lockup so a caller can animate it, colour it, or leave it out.
 * Callers must gate it on `features.installments`: see `FonekistLockup`.
 */
export function FonekistTagline({ className = "", label }: MarkProps) {
  return (
    <svg viewBox={TAGLINE_VIEW_BOX} className={className} {...a11y(label)}>
      <path fill="currentColor" fillRule="evenodd" d={TAGLINE_PATH} />
    </svg>
  );
}

/** The wifi disc on its own: the O of FONEKIST, and the only part that survives at 16 px. */
export function FonekistMark({ className = "", label }: MarkProps) {
  return (
    <svg viewBox={MARK_VIEW_BOX} className={className} {...a11y(label)}>
      <path fill="currentColor" fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/**
 * The full stacked lockup: wordmark, tagline, and optionally "Mobile Store".
 *
 * `tagline` defaults to off because "buy now, pay later" is a promise about a product that
 * is behind a feature flag. Rendering it where installments are switched off would advertise
 * something the site will not let anyone apply for, so the callers that show it check
 * `features.installments` first.
 */
export function FonekistLockup({
  className = "",
  label,
  tagline = false,
  submark = false,
}: MarkProps & { tagline?: boolean; submark?: boolean }) {
  const word = viewBoxOf(WORDMARK_VIEW_BOX);
  const tag = viewBoxOf(TAGLINE_VIEW_BOX);
  const sub = viewBoxOf(SUBMARK_VIEW_BOX);

  // The gaps are the ones measured off the supplied artwork, so the stack keeps the
  // proportions the logo was drawn with rather than proportions a stylesheet invented.
  const gapTagline = 33;
  const gapSubmark = 29;
  const width = Math.max(word.width, tagline ? tag.width : 0);
  const taglineTop = word.height + gapTagline;
  const submarkTop = taglineTop + tag.height + gapSubmark;
  const height = submark
    ? submarkTop + sub.height
    : tagline
      ? taglineTop + tag.height
      : word.height;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      {...a11y(label)}
    >
      <path fill="currentColor" fillRule="evenodd" d={WORDMARK_PATH} />
      <path className="fonekist-dot" fill="var(--brand-dot)" fillRule="evenodd" d={WORDMARK_DOT_PATH} />
      {tagline && (
        <g transform={`translate(0 ${taglineTop})`}>
          <path fill="currentColor" fillRule="evenodd" d={TAGLINE_PATH} />
        </g>
      )}
      {submark && (
        <g transform={`translate(${width - sub.width} ${submarkTop})`}>
          <path fill="currentColor" fillRule="evenodd" d={SUBMARK_PATH} />
        </g>
      )}
    </svg>
  );
}

/** The width and height of a `viewBox`, which is where every offset in the stack comes from. */
function viewBoxOf(viewBox: string): { width: number; height: number } {
  const parts = viewBox.split(" ").map(Number);
  return { width: parts[2] ?? 0, height: parts[3] ?? 0 };
}
