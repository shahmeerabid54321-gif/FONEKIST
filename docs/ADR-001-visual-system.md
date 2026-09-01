# ADR-001 — FONEKIST visual system

**Status:** Accepted

## Context

FONEKIST shares a commerce backend with the Voltmark storefront but not a visual identity.
Voltmark's system is ADR-021 in the WEBSITE DESIGN monorepo: cinematic monochrome, one
desaturated technical blue, a bezel surface treatment, one full-bleed dark story band per
page. That system was chosen for a broad electronics catalog and it is working there.

It is the wrong system here for two reasons. FONEKIST sells one category, where the device
photograph carries almost all of the information a monochrome system would otherwise have to
carry typographically. And FONEKIST's central promise is an installment offer, which needs a
colour that means trust and can be used consistently for that meaning alone. ADR-021 spends
its only accent on links and focus.

The Pakistani market reference points also pull in different directions. Karachi Electronics
gets the substance right for this market: installment pricing stated up front, verification
guidance, delivery reassurance, order tracking, direct WhatsApp contact. It gets the
presentation wrong: repeated promotional marquees, campaign-heavy imagery, dense navigation,
and uniform ratings that cannot all be real. Samsung Pakistan gets the presentation right:
disciplined spacing, restrained colour, the device given room. Neither is a template to copy,
and Samsung's trade dress and model-family taxonomy are specifically not ours to take.

## Decision

A separate system for FONEKIST, recorded here rather than as an amendment to ADR-021, which
stays authoritative and unchanged for Voltmark.

- **Neutrals carry structure.** Ink `#0B0C0E`, mist `#F5F6F7`, white, one hairline. The
  photograph is the loudest thing on the page and the interface does not compete with it.
- **Colour is meaning, never decoration.** Emerald `#0B6B4B` for trust: installments, PTA
  verified, warranty, in stock. Amber only for a promotion genuinely running. Red only for a
  real failure. There is no sale red and no rating colour.
- **Two typefaces**, self-hosted through `next/font`. Geist for the interface, Geist Mono for
  what is technical and countable: model codes, prices, tenures, delivery figures. Money in
  the sans, data in the mono.
- **A shape lock:** cards 20px, media 16px, controls 10px, chips fully round.
- **No manufactured urgency.** No countdowns, no marquees, no autoplay, no "only 2 left"
  unless two is the actual count. No ratings or review counts at all, because there is no
  review data, and a rating that cannot be truthful is worse than an absent one.
- **Both colour schemes are first class.** Tokens are defined on bare `:root` and redefined
  under `prefers-color-scheme` and `[data-theme]`, and axe runs over both in CI.

## Alternatives

- **Adopt ADR-021 unchanged.** Rejected: it has no colour available to mean "installment",
  which is the thing this storefront most needs to communicate.
- **Follow the Karachi Electronics presentation.** Rejected: its promotional density is the
  specific weakness FONEKIST is trying to beat, and its uniform ratings are exactly the
  fabricated figure the PRD rules out.

## Consequences

- `@pk/ui` cannot be reused, because its components encode ADR-021. FONEKIST owns its
  components. This is a real duplication cost, accepted deliberately (ADR-022).
- Emerald is spent. Anything else needing emphasis has to earn it through weight, size or
  space rather than by borrowing the trust colour.

## Revisit when

Real product photography lands and the layout can be judged against it rather than against
stand-ins, or when the installment offer's presentation is tested with actual customers.
