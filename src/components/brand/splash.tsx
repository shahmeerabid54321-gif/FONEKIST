import { OrbBody, OrbDefs } from "./orb";

/**
 * The opening splash: "Signal, Device, Access".
 *
 * There is no wordmark in it, on purpose. The test the piece is built to pass is that
 * someone who never sees the word FONEKIST still recognises the animation as FONEKIST after
 * a few visits, so it is assembled only from what the identity already owns: the black, the
 * white, the glossy red sphere, the signal curves behind the O, and the leaning handset.
 *
 * The beats:
 *
 *   Signal   a red point wakes off centre, pulses once, becomes a sphere, and drags thin
 *            white curves through the dark as it travels to the middle, where the curves
 *            snap into the geometry of the wifi glyph the logo uses for its O.
 *   Device   the curves straighten and close into a handset outline at the logo's lean. The
 *            sphere drops onto the screen and lands, and a shockwave crosses the glass.
 *   Kist     four bars fill one after another, not together. Progressive payment, arriving
 *            complete, in the same bars the logo already carries inside its E.
 *   Access   the handset rushes the camera and the viewer goes through the screen. The shop
 *            is literally revealed inside the phone's glass and grows out of it, so the
 *            splash and the site are one continuous shot rather than a card that dissolves.
 *
 * Total 1.9s, once per browser session. Nothing on a reload, nothing on a client navigation.
 *
 * No sound. The brief asked for it only where audio is already permitted, and on a first
 * document load there has been no user gesture, so every browser blocks playback. Code for
 * it would be code that never runs.
 *
 * Four properties matter more than the choreography:
 *
 * 1. It never blocks. The overlay is `pointer-events: none` and the real page is rendered
 *    and interactive underneath from the first frame.
 * 2. It is invisible to assistive technology. `aria-hidden`, nothing focusable, no trap.
 * 3. It fails open. Everything hangs off an attribute set by `SPLASH_GATE_SCRIPT`; with
 *    JavaScript off, with `sessionStorage` throwing (Safari private mode), or on any later
 *    navigation, the attribute is absent and the overlay stays `display: none`.
 * 4. It ends. The container's hide animation is independent of the reveal, so a browser that
 *    cannot animate the registered custom properties still clears the overlay on time and
 *    the dive degrades to a fade.
 *
 * CSS only, against this project's usual reach for a motion library: the whole mechanism
 * depends on painting during the first frame, before React exists on the page. Anything
 * driven by JavaScript starts after hydration, which is the flash this exists to avoid.
 *
 * `prefers-reduced-motion` is honoured in `globals.css`, where every beat is replaced by the
 * finished frame and one plain fade.
 */

export const SPLASH_GATE_SCRIPT =
  'try{if(!sessionStorage.getItem("fk.splash")){sessionStorage.setItem("fk.splash","1");' +
  'document.documentElement.setAttribute("data-splash","on")}}catch(e){}';

/* The stage is a 400 unit square. Every number below is in those units. */
const C = 200; // centre, both axes

/* The handset, drawn upright and leaned as a group, so the geometry stays readable. */
const PHONE = { x: 142, y: 92, w: 116, h: 216, r: 18 };
const SCREEN = { x: 150, y: 104, w: 100, h: 192, r: 12 };
const LEAN = 16; // degrees, matching the handset resting on the K in the logo

/* Four bars, filling left to right. The same bars the logo puts inside its E. */
const BARS = [14, 24, 34, 44].map((h, i) => ({
  x: 167 + i * 18,
  y: 250 - h,
  w: 12,
  h,
  delay: 1200 + i * 92,
}));

/**
 * The signal curves.
 *
 * Arcs of one family of concentric circles about the centre, so when the group turns they
 * land exactly on the wifi glyph's geometry rather than approximately. Lengths differ and the
 * stroke fades at both ends, so they read as waves dragged through the dark rather than as a
 * rendered icon.
 *
 * The radii are capped by the glass they end up inside. The screen is 100 units across, so a
 * circle about its centre fits only while its radius stays under 50, and the outermost arc is
 * 46 plus half a stroke. They used to run out to 110, which put three of the four outside a
 * handset that was drawing itself around them.
 */
const ARCS = [
  { r: 22, spread: 40, delay: 360 },
  { r: 31, spread: 36, delay: 430 },
  { r: 39, spread: 31, delay: 500 },
  { r: 46, spread: 27, delay: 570 },
];

function arcPath(radius: number, spreadDegrees: number) {
  const a = (spreadDegrees * Math.PI) / 180;
  const x1 = C + radius * Math.cos(-a);
  const y1 = C + radius * Math.sin(-a);
  const x2 = C + radius * Math.cos(a);
  const y2 = C + radius * Math.sin(a);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function BrandSplash() {
  return (
    <div className="brand-splash" aria-hidden="true">
      {/*
        The ground, and the way out of it.

        A hole the exact shape of the handset's glass is cut from this black and then driven
        outward past the corners, so the page is revealed from inside the screen instead of
        the black being faded off the front of it.
      */}
      <div className="brand-splash__ground" />

      <svg viewBox="0 0 400 400" className="brand-splash__stage" aria-hidden="true">
        <OrbDefs id="fk-splash-orb" />
        <defs>
          {/* Fades both ends of every curve, so they have no hard stop. */}
          <linearGradient id="fk-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="42%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          {/* Keeps the landing shockwave inside the glass. */}
          <clipPath id="fk-glass">
            <rect x={SCREEN.x} y={SCREEN.y} width={SCREEN.w} height={SCREEN.h} rx={SCREEN.r} />
          </clipPath>
        </defs>

        {/* Everything the camera dives into travels together. */}
        <g className="brand-splash__dive">
          <g className="brand-splash__waves">
            {ARCS.map((arc) => (
              <path
                key={arc.r}
                className="brand-splash__arc"
                d={arcPath(arc.r, arc.spread)}
                pathLength={100}
                stroke="url(#fk-arc)"
                style={{ animationDelay: `${arc.delay}ms` }}
              />
            ))}
          </g>

          <g className="brand-splash__device" transform={`rotate(${LEAN} ${C} ${C})`}>
            <rect
              className="brand-splash__shell"
              x={PHONE.x}
              y={PHONE.y}
              width={PHONE.w}
              height={PHONE.h}
              rx={PHONE.r}
            />
            <rect
              className="brand-splash__glass"
              x={SCREEN.x}
              y={SCREEN.y}
              width={SCREEN.w}
              height={SCREEN.h}
              rx={SCREEN.r}
            />
            <rect className="brand-splash__earpiece" x={185} y={113} width={30} height={5} rx={2.5} />

            <g clipPath="url(#fk-glass)">
              <circle className="brand-splash__shock" cx={C} cy={C} r={10} />
            </g>

            {BARS.map((bar) => (
              <rect
                key={bar.x}
                className="brand-splash__bar"
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                rx={2}
                style={{ animationDelay: `${bar.delay}ms` }}
              />
            ))}
          </g>

          {/* Last, so it passes in front of the glass it lands on. */}
          <g className="brand-splash__orb">
            <OrbBody id="fk-splash-orb" cx={C} cy={C} r={13} reflection />
          </g>
        </g>
      </svg>
    </div>
  );
}
