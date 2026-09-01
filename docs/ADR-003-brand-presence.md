# ADR-003 — Brand presence: the accent, the two reds, the icons, the progress motif

**Status:** Accepted
**Extends:** ADR-001 (visual system), ADR-002 (the logo)

## Context

ADR-001 opens with "colour is meaning, never decoration" and then, twenty lines later,
defines `--color-deep: #06231b` as "the hero band's ground". Those two statements cannot
both hold, and the second one won.

By the time the storefront was built, that green-black was the ground of the footer, of
every hero band, of the home installments section, of the four-figure disclosure grid and
of the scrim on every brand mosaic tile. Emerald itself filled every primary button, every
selected budget chip, the header's installments link and the focus ring on every
interactive element on the site. Somewhere around a third of the painted pixels were green.

The effect is the one the design literature describes precisely: when the gradients, the
headers, the buttons and the links all share the accent, the canvas becomes noise and the
accent loses its semantic meaning. Emerald was reserved to mean *installments, PTA verified,
warranty, in stock*. It had stopped meaning any of those, because the footer was made of it
and the footer is not about installments.

At the same time the brand itself was absent. ADR-002 traced the mark to vector and put it
in the header and the footer, and defined `--brand-ink`, `--brand-paper` and `--brand-dot`.
Those three tokens were then consumed by exactly two things: a 1.5 second splash overlay and
the app icon. No page surface used the logo's black. The red appeared once per session and
never again. And there was not one icon anywhere on the site: navigation, the trust strip,
the footer columns, filters, checkout and order tracking were all bare text, which is most
of why the pages read as unfinished rather than as restrained.

## Decision

### The dark bands are the logo's black

`--color-deep` and `--color-deep-2` are deleted. Every dark band on the site is
`--surface-inverse`, which is `--brand-ink` on the light scheme and pure black on the dark
one. It goes *deeper* than the dark page rather than lighter, because the dark page is
already `#0b0c0e` and the same value would make the footer vanish into it; the bands carry a
hairline for the same reason.

The band is a class, `.on-inverse`, and it redefines the foreground tokens rather than
recolouring its children. A `SectionHead`, an icon or a button inside a band resolves
`--text` to paper and comes out right without a prop threaded down to it. This is what stops
the next dark band from being assembled out of hard-coded `text-white/65`, which is how the
green eyebrows (`#8fe0c0`) got hard-coded into three files.

### Emerald never grounds a surface

It appears as text, a chip, a hairline or a small fill. Nothing on the site is built out of
it. Concretely, and this list is the test — `grep -rn "color-emerald" src` should return
these and nothing else:

  - **the monthly figure**, wherever it appears: the product card, the comparison column,
    the brand page's "or monthly from", and the installment summary line;
  - **the PTA-approved chip** on a card;
  - **a success that has actually happened**: the `InlineAlert` success tone, the "we have
    your application" panel, and a document confirmed as uploaded;
  - **the affordability meter's `trust` tone**, which is measuring the installment pool.

Anything that is a *selection* state is ink instead, because "this is the row you picked" is
not a statement about installments, warranty or stock. That covers the chosen tenure, the
chosen delivery and payment method (`--color-accent`, which was emerald and is ink now), the
chosen budget chip, and the active filter.

The focus ring moves off emerald and onto `--focus-ring`, which is `--text` (ink on light,
near-white on dark) and paper inside a band. A focus ring appears on every interactive
element on the site, so spending the trust colour on it guaranteed green everywhere by
construction.

Primary buttons take the ink fill that the header's cart pill already used and that already
looked right, which means the site now has one primary-action treatment instead of two.

### Two reds, two names, one rule

ADR-002 locked `--brand-dot` to the dot over the i and the app icon. That was the correct
call when the alternative was "adopt black, white and red as the palette" and lose red as a
failure signal. It is the wrong call now, because it is a large part of why the brand is
invisible, and because the actual risk is confusion between the two reds rather than the
existence of a second one.

    --brand-dot     #e4483c   the logo's sphere, and the site's one ornament
    --color-danger  #a3242b   a real failure, and only that

`--brand-dot` earns: the marker on the active nav item, the pip on a section head, the lit
node on a progress track, the dot in the mark, the app icon. The rule runs in both
directions: `--brand-dot` may never appear on an alert, an error message or a destructive
control, and `--color-danger` may never appear on brand furniture.

`--brand-dot` is 3.97:1 on paper. It is therefore legal for a shape 3px or thicker and is
not legal for text at any size the site actually uses. On the brand black it is 4.9:1 and
may carry text.

That last constraint is why there is a third token:

    --brand-dot-strong  #d13a2d   the brand red as a surface with type on it
    --on-brand-dot      #ffffff   the foreground for that surface

Every wayfinding link on the site fills with the brand red on hover and on keyboard focus
(`.nav-pill`), which is the single largest thing making the pages feel like they belong to
this shop rather than to a template. White on `--brand-dot` would have been 3.97:1 and those
labels are 14px, so the pill uses `--brand-dot-strong` instead: 4.82:1 with white, and still
1.53:1 away from `--color-danger`, which keeps it on the brand side of the two-red rule.

This is the same role split emerald already has (`--color-emerald` / `-strong` /
`-contrast`) and it exists for the same reason. "The accent" and "an accent you can read
on" are two different colours, and letting each component pick one value for both jobs is
exactly how the contrast failures got in the first time.

Focus takes the pill as well as hover, so a keyboard user gets the affordance a pointer user
gets. The current-page dot carries `.nav-pill-mark` and turns white with the label, because
a red marker on a red pill disappears at the moment it is being pointed at.

### The icons are drawn on the mark's geometry

One file, `src/components/icons.tsx`, about twenty icons, no dependency. A general-purpose
library would have been faster and would have added clarity without adding identity; these
are drawn to the mark's own stroke weight and arc radii, and the wifi arc from the logo's O
recurs through them.

They follow the accessibility decision `logo.tsx` already made: hidden from assistive
technology by default, named only when the icon *is* the accessible name of its container.
An icon beside a label that already says "Delivery" must not make a screen reader say
"delivery delivery".

### The signal arc is the progress motif

The logo's most ownable shape is the three concentric arcs of the wifi disc, and an arc that
fills is what a progress indicator wants to be anyway. One component, `SignalProgress`,
serves the phone finder, the credit application, checkout and order tracking. Four flows that
each used to invent their own step display now share the logo's shape.

### Gamification may only visualise state the system already holds

Progress tracks, the affordability meter, the total-versus-cash bar and the comparison tray
all render figures the system already knows: which step you are on, how many phones match,
what `difference_pkr` is, how many of the three comparison slots are filled.

Explicitly excluded, and this is the whole boundary: points, badges, streaks, leaderboards,
spin-to-win, countdowns, and any scarcity or urgency figure that was not counted. Those are
the half of the gamification field that works by manufacturing pressure, and ADR-001 already
ruled them out for the same reason. A progress bar that reflects a real position is a
navigational aid; one that reflects an invented position is a dark pattern.

## Consequences

- ADR-001's `--color-deep` is gone and ADR-002's red lock is superseded. Both ADRs stay as
  the record of why the system looks the way it does; this one records where it changed.
- Three reds now coexist, two of them brand and one of them failure, and they are close in
  hue. That is a real risk and it is carried by naming rather than by hoping: none of the
  three is ever reached for generically, and the split between `--brand-dot` and
  `--brand-dot-strong` is decided by whether type sits on it, not by taste.
- The icon set is hand-maintained. A twenty-first icon has to be drawn rather than imported,
  which is the cost of it looking like ours.
- Emerald is now genuinely scarce, so anything that needs emphasis and is not about trust has
  to earn it through weight, size or space. This was already ADR-001's stated intent; it is
  only true now.

## Revisit when

Real product photography lands, since the bands were designed to hold stand-in imagery and
the balance between the black and the photograph will change, or if the two reds are ever
observed being confused in practice.
