"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPkr } from "@/lib/pk";
import { Eyebrow } from "./brand/signal-arc";
import { IconCalendar, IconChevronRight } from "./icons";

/**
 * The banner.
 *
 * A phone shop opens with a picture of a phone. Everything above the fold used to be type
 * on white, which reads as a document rather than a shop, and gave a customer nothing to
 * want. This is the first thing on the page and it carries the three offers worth leading
 * on: the flagship, the cheapest monthly plan, and the best-value handset.
 *
 * It does not move on its own. An autoplaying carousel decides for the reader, restarts
 * mid-sentence, and is the first thing to fail a reduced-motion audit. This one snaps under
 * a thumb, an arrow key or a dot, which does the same commercial work and leaves the reader
 * in charge. `scroll-snap` does the scrolling, so with JavaScript off it is still a
 * swipeable rail rather than a dead frame.
 *
 * Every figure on a slide is a real one read from the catalogue: a price that is charged, a
 * monthly figure that a real plan offers. There is no countdown, no "up to 40% off", and no
 * invented saving, which is what most of the reference designs put here.
 */

export interface HeroSlide {
  /** Small label above the headline. */
  eyebrow: string;
  headline: string;
  /** One line. If it needs two, the slide is trying to say too much. */
  support: string;
  image: string;
  /** Empty when the photograph is decorative, which it is when the headline names it. */
  imageAlt: string;
  href: string;
  cta: string;
  /** The cash price, when the slide is about one handset. */
  pricePkr?: number | null;
  /** Shown only when it is genuinely higher than `pricePkr`. */
  compareAtPkr?: number | null;
  /** Rendered as "from Rs X a month" beside the price. */
  monthlyPkr?: number | null;
}

export function HeroBanner({ slides }: { slides: HeroSlide[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Derived from the rail's own scroll position rather than tracked separately, so a swipe,
  // a keyboard scroll and a dot press all agree about which slide is showing.
  const onScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const index = Math.round(rail.scrollLeft / rail.clientWidth);
    setActive(Math.max(0, Math.min(slides.length - 1, index)));
  }, [slides.length]);

  const goTo = useCallback((index: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({ left: index * rail.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => rail.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  if (slides.length === 0) return null;

  return (
    <section aria-roledescription="carousel" aria-label="Featured" className="relative">
      <div ref={railRef} className="snap-rail snap-full">
        {slides.map((slide, index) => (
          <div
            key={slide.href}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            className="relative min-h-[26rem] overflow-hidden sm:min-h-[32rem]"
          >
            <Image
              src={slide.image}
              alt={slide.imageAlt}
              fill
              priority={index === 0}
              sizes="100vw"
              className="object-cover object-right"
            />
            {/*
              The scrim, not a decoration. The photographs are real and their left-hand side
              is not reliably dark, so white text over a bare photograph would pass on one
              slide and fail on the next. This makes the text side a known quantity.
            */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-[var(--surface-inverse)] via-[var(--surface-inverse)]/92 to-[var(--surface-inverse)]/20"
            />

            <div className="relative mx-auto flex min-h-[26rem] max-w-6xl flex-col justify-center px-5 py-14 sm:min-h-[32rem] sm:px-8">
              <Eyebrow className="text-[var(--on-inverse-soft)]">{slide.eyebrow}</Eyebrow>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.08] tracking-tight text-[var(--on-inverse)] sm:text-6xl">
                {slide.headline}
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--on-inverse-soft)] sm:text-lg">
                {slide.support}
              </p>

              {(slide.pricePkr != null || slide.monthlyPkr != null) && (
                <div className="mt-7 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  {slide.pricePkr != null && (
                    <span className="text-2xl font-semibold tracking-tight text-[var(--on-inverse)] sm:text-3xl">
                      {formatPkr(slide.pricePkr)}
                    </span>
                  )}
                  {slide.pricePkr != null &&
                    slide.compareAtPkr != null &&
                    slide.compareAtPkr > slide.pricePkr && (
                      <span className="text-base text-[var(--on-inverse-muted)] line-through">
                        {formatPkr(slide.compareAtPkr)}
                      </span>
                    )}
                  {slide.monthlyPkr != null && (
                    <span className="inline-flex items-center gap-2 rounded-[var(--radius-chip)] bg-white/12 px-3.5 py-1.5 text-sm font-medium text-[var(--on-inverse)] ring-1 ring-inset ring-white/20">
                      <IconCalendar />
                      from {formatPkr(slide.monthlyPkr)} a month
                    </span>
                  )}
                </div>
              )}

              <div className="mt-8">
                <Link
                  href={slide.href as Route}
                  className="group inline-flex min-h-[48px] items-center gap-2 rounded-[var(--radius-chip)] bg-[var(--brand-paper)] px-8 text-sm font-semibold text-[var(--brand-ink)] transition-transform duration-300 [transition-timing-function:var(--ease-brand)] hover:scale-[1.02]"
                >
                  {slide.cta}
                  <IconChevronRight className="transition-transform duration-300 [transition-timing-function:var(--ease-brand)] group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-2.5">
          {slides.map((slide, index) => (
            <button
              key={slide.href}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show slide ${index + 1}: ${slide.headline}`}
              aria-current={index === active}
              // 44px of tappable area around a 10px dot, so the control is reachable on a
              // phone without a row of fat pills across the photograph.
              className="grid h-11 w-11 place-items-center"
            >
              <span
                className={
                  index === active
                    ? "block h-2.5 w-8 rounded-full bg-[var(--brand-dot)] transition-all duration-300 [transition-timing-function:var(--ease-brand)]"
                    : "block h-2.5 w-2.5 rounded-full bg-white/45 transition-all duration-300 [transition-timing-function:var(--ease-brand)]"
                }
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
