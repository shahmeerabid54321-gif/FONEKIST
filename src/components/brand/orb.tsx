/**
 * The orb.
 *
 * The glossy red sphere from the logo, drawn rather than flattened: a light source at the
 * upper left, the body falling to a deeper red at the lower right, one specular highlight,
 * a bounce light along the bottom edge where a real sphere catches its surroundings, and a
 * soft reflection beneath it. A flat circle in the brand red reads as a dot; this reads as
 * an object, which is what lets it behave like one when it moves.
 *
 * It is meant to recur. The splash is where it is introduced, but the same object is what
 * should mark the active slide, the chosen installment step, or the live state anywhere on
 * the site, so the motion identity is the product's rather than an intro's.
 *
 * Colour is the one place the mark is allowed red. `--brand-dot` is the logo's red and is
 * deliberately not `--color-danger`, which means a real failure and nothing else.
 *
 * `id` must be unique per instance on a page, because the gradients are referenced by id.
 */

export function OrbDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* Body. The focal point sits up and left of centre, which is what makes it a sphere
          rather than a disc with a gradient on it. */}
      <radialGradient id={`${id}-body`} cx="50%" cy="50%" r="58%" fx="32%" fy="26%">
        <stop offset="0%" stopColor="#ff8d80" />
        <stop offset="34%" stopColor="#f0574a" />
        <stop offset="72%" stopColor="#d63a2d" />
        <stop offset="100%" stopColor="#8f1d15" />
      </radialGradient>

      {/* The bounce along the lower edge. Without it the sphere reads as pasted on. */}
      <radialGradient id={`${id}-bounce`} cx="50%" cy="50%" r="52%" fx="62%" fy="86%">
        <stop offset="0%" stopColor="#ff6a5a" stopOpacity="0.85" />
        <stop offset="55%" stopColor="#ff6a5a" stopOpacity="0" />
      </radialGradient>

      <radialGradient id={`${id}-spec`}>
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>

      {/* Restrained. A glow that reads as a light source, not as a neon sticker. */}
      <radialGradient id={`${id}-glow`}>
        <stop offset="0%" stopColor="#ff4a3a" stopOpacity="0.5" />
        <stop offset="45%" stopColor="#e4483c" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#e4483c" stopOpacity="0" />
      </radialGradient>

      <radialGradient id={`${id}-reflect`}>
        <stop offset="0%" stopColor="#e4483c" stopOpacity="0.34" />
        <stop offset="100%" stopColor="#e4483c" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/**
 * The sphere itself, in the coordinate space of whatever svg it is placed in.
 *
 * `glow` and `reflection` are separable because the reflection only makes sense when the
 * orb is sitting on something. In flight, or as a six pixel indicator, it is not.
 */
export function OrbBody({
  id,
  cx,
  cy,
  r,
  glow = true,
  reflection = false,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  glow?: boolean;
  reflection?: boolean;
}) {
  return (
    <>
      {glow && <circle cx={cx} cy={cy} r={r * 3.2} fill={`url(#${id}-glow)`} />}
      {reflection && (
        <ellipse cx={cx} cy={cy + r * 1.9} rx={r * 1.5} ry={r * 0.42} fill={`url(#${id}-reflect)`} />
      )}
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-body)`} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-bounce)`} />
      {/* Tilted, so the highlight sits on the sphere's shoulder rather than dead on top. */}
      <ellipse
        cx={cx - r * 0.3}
        cy={cy - r * 0.36}
        rx={r * 0.38}
        ry={r * 0.27}
        fill={`url(#${id}-spec)`}
        transform={`rotate(-28 ${cx - r * 0.3} ${cy - r * 0.36})`}
      />
    </>
  );
}

/**
 * The orb on its own, for reuse around the site: an active slide marker, the current
 * installment step, a live indicator. Decorative by default, so it is hidden from assistive
 * technology unless the caller gives it a label.
 */
export function BrandOrb({
  size = 12,
  id = "fk-orb",
  className = "",
  label,
}: {
  size?: number;
  id?: string;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      {...(label
        ? { role: "img" as const, "aria-label": label }
        : { "aria-hidden": true as const, focusable: false as const })}
    >
      <OrbDefs id={id} />
      <OrbBody id={id} cx={50} cy={50} r={30} glow={false} />
    </svg>
  );
}
