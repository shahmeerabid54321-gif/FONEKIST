# ADR-002 — The logo, and the splash that opens on it

**Status:** Accepted
**Extends:** ADR-001 (visual system)
**Supersedes:** the wordmark-wipe splash, replaced before it shipped

## Context

Until now FONEKIST had a visual system but no mark: the name was set in the interface
typeface wherever it appeared, which is a placeholder, not an identity.

A logo was supplied. It is a heavy geometric wordmark, FONEKIST, whose O is a wifi disc and
whose K is leaned on by a tilted handset with signal bars rising out of it; a red sphere
sits as the dot over the i; below it, widely tracked, "BUY NOW, PAY LATER", and beneath that
"Mobile Store". It arrived as a JPEG: white and red on a black rectangle, 1080x758.

That file cannot be the logo the site uses. It has an opaque black ground, so it can only
ever sit on black; it is fixed at one resolution, so it softens on the phone screens this
storefront is mostly read on; and it has one hard-coded colour, so it cannot follow a colour
scheme the whole rest of the system is built to follow.

## Decision

**The mark is vector, and it takes its colour from context.** The artwork was contour-traced
into paths (`src/components/brand/logo-paths.ts`) and is rendered inline as SVG filled with
`currentColor`. One definition is therefore ink on the light scheme, paper on the dark one,
and white on the hero band, with no second file and no `<img>` that has to guess which
version to load. The source JPEG is kept at `docs/brand/logo-source.jpeg` so the trace can
be redone rather than reverse-engineered.

**The logo's red is not a system colour.** ADR-001 spends red on one meaning: a real
failure. The mark needs the red sphere over the i, so it gets `--brand-dot`, which is used
by that dot and by the app icon, and by nothing else. Keeping it out of `--color-danger`
is what stops a component reaching for the failure colour and getting the brand one.

**The tagline is gated on the feature flag it describes.** "Buy now, pay later" is a claim
about the installment offer, which is behind `NEXT_PUBLIC_FEATURE_INSTALLMENTS` and stays
off in shared environments until ADR-025's legal review clears. So `FonekistLockup` renders
the wordmark always and the tagline only when installments are actually switched on. The
alternative is advertising, on every page, an offer the site will not let anyone take.

**The logo supplies the site's one typographic idea.** The tagline's widely tracked
monospaced caps became `.brand-eyebrow`, which every small label on the site now uses. This
is most of what makes the pages read as designed around the mark rather than merely carrying
it in a corner.

**The site opens on brand motion, once per session.** Not on the logo. The splash is
"Signal, Device, Access", and it contains no wordmark at all:

- **Signal.** A red point wakes off centre, pulses once, and becomes the glossy sphere from
  the mark. It travels to the middle dragging thin white curves through the dark behind it.
  At the centre the curves snap a quarter turn into the geometry of the wifi glyph the logo
  uses for its O.
- **Device.** The curves straighten and close into a handset outline that draws itself at the
  lean the logo gives it. The sphere drops onto the glass and lands, and one shockwave
  crosses it.
- **Kist.** Four bars fill one after another, never together. Sequence is the content: it is
  the shape of paying in instalments and arriving complete, in the same bars the logo already
  carries inside its E.
- **Access.** The handset rushes the camera and the viewer goes through the screen. The shop
  is revealed inside the phone's glass and grows out of it, so the splash and the site are one
  continuous shot rather than a card that dissolves off the front of the page.

1.9 seconds, once per browser session.

The test it is built to pass is that someone who never sees the word FONEKIST still
recognises the animation as FONEKIST after a few visits. That is why it is assembled only
from what the identity already owns, and why the wordmark is absent: a logo that scales up
and fades is a loader, and every brand has one.

**The orb is a component, not a splash prop.** `BrandOrb` exists so the same object can mark
the active slide, the chosen installment step, or a live state anywhere on the site. Motion
identity that appears once before the page and never again is decoration.

Four properties make the splash acceptable rather than an obstacle:

- It never blocks. The overlay is `pointer-events: none` and the real page is rendered and
  interactive underneath from the first frame.
- It is invisible to assistive technology: `aria-hidden`, nothing focusable, no focus trap.
- It is CSS only. An inline script in `<head>` sets one attribute before the first paint and
  the stylesheet does the rest. No client component, no hydration cost, no timer. This is a
  deliberate exception to the house preference for a motion library: anything driven by
  JavaScript starts after hydration, which is the flash the splash exists to avoid.
- It fails open, and it ends. With JavaScript off, with `sessionStorage` throwing (Safari
  private mode), or on any later navigation, the attribute is absent and the overlay stays
  `display: none`. The container's hide animation is independent of the reveal, so a browser
  that cannot animate the registered custom properties still clears it on time.

Under `prefers-reduced-motion` every beat resolves to its end state and the only change is
one opacity fade. It is not switched off entirely, because the global reduced-motion reset
collapses every animation to 0.01ms, and that would flash a black overlay for a single frame,
which is a worse thing to show someone than a still image.

**No sound.** The brief asked for it only where audio is already permitted. On a first
document load there has been no user gesture, so every browser blocks playback, and code for
it would be code that never runs.

## Alternatives

- **Ship the JPEG.** Rejected: black-ground only, fixed resolution, no colour scheme.
- **Redraw the wordmark in a licensed typeface.** Rejected: the letterforms are the logo,
  and the wifi O and the leaning handset are custom anyway. A near-match reads as a mistake.
- **Adopt black, white and red as the palette.** Rejected: it would take red away from
  meaning failure, which ADR-001 depends on, for decoration.
- **A wordmark reveal.** Built first, then rejected: a wipe across the letters followed by a
  fade is the reveal every brand ships, it takes nothing from this particular logo, and it
  ends by dissolving rather than handing over.
- **Splash on every page load.** Rejected: a shop that replays its opening on every page view
  is an obstacle. Once per session is the most it can earn. A shortened repeat-visit variant,
  the orb alone crossing the screen, is available if that trade looks different later.
- **No splash.** The honest default, overruled by an explicit request. The cost is real and
  is bounded by the four properties above.

## Consequences

- The traced paths are generated. They are re-traced from the source artwork, not edited by
  hand; nudging a coordinate would silently desynchronise the mark from the artwork.
- The wordmark's aspect ratio is roughly 3.6:1 and the handset rises above the cap height,
  so the letters occupy the lower half of the box. Callers set a height and let the width
  follow, and the header allows for a mark taller than a line of type.
- Two 512px app icons ship, `any` and `maskable`, because Android crops a maskable icon to
  the launcher's shape and anything near the edge is lost.
- The splash is the first paint on a first visit, so it is briefly what a field measurement
  of Largest Contentful Paint sees. Everything in it is inline SVG rather than an image or a
  text node, which are the two things LCP actually nominates, so the effect should be small.
  Worth confirming against field data once LCP is being tuned.
- The reveal depends on `@property` and an animated `clip-path`. Both are widely supported,
  and where they are not the overlay degrades to a fade and still leaves on time.

## Revisit when

Real product photography lands, since the splash is competing with the first photograph for
the opening moment, or if field LCP data shows the overlay costing more than it is worth.
