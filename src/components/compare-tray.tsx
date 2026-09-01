"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { buildCompareHref, MAX_COMPARE } from "@/lib/compare";
import { IconCheck, IconClose, IconCompare, IconPlus } from "./icons";

/**
 * The comparison tray.
 *
 * A comparison is the thing this site is for: three phones with the same specification
 * fields side by side, live prices, and the plan totals under each. Until now the only way
 * to build one was to open a product page and press "compare this with another phone",
 * which put one handle in the URL and then left you to find the second one with that link
 * still in your history. In practice nobody built one.
 *
 * So the shortlist follows you: pick phones as you browse and a bar at the foot of the page
 * says how many of the three slots are filled and offers the comparison when there are two.
 *
 * **Where the state lives, and why.** The `/compare` page reads the URL and only the URL
 * (`?ids=a,b,c`), because the entire point of building a comparison is being able to send it
 * to somebody. That does not change. This tray is `localStorage` layered over the top: a
 * convenience for one person in one browser, never the record. When storage is unavailable
 * (a private window, storage disabled, Safari throwing on access) every read and write here
 * fails closed to an empty list and the tray simply does not appear. The URL still works.
 *
 * It counts real slots. There is no reward for filling all three, nothing is unlocked, and
 * the cap is `MAX_COMPARE` because four columns of specifications do not fit a phone screen
 * (see `lib/compare.ts`), not because three is a target (ADR-003).
 */

const KEY = "fonekist.compare";

/*
 * A tiny store rather than a context provider.
 *
 * The toggle sits inside product pages and the tray sits in the layout, so the two are not
 * in the same subtree and cannot share a provider without wrapping the whole app in a client
 * component. `useSyncExternalStore` gives both of them the same value, keeps them in step
 * across tabs through the `storage` event, and renders a stable empty list on the server.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: readonly string[] = [];
const EMPTY: readonly string[] = [];

function read(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_COMPARE);
  } catch {
    // A private window, storage disabled, or malformed JSON from an older build. An empty
    // shortlist is the correct answer to all three.
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

/** Re-reads storage and notifies. Returns the list so callers can act on the new value. */
function refresh(): readonly string[] {
  const next = read();
  const changed =
    next.length !== snapshot.length || next.some((handle, index) => handle !== snapshot[index]);
  if (changed) {
    snapshot = next;
    emit();
  }
  return snapshot;
}

function write(handles: readonly string[]) {
  snapshot = handles.slice(0, MAX_COMPARE);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // The shortlist still works for this page view; it just will not survive a reload.
  }
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCompareShortlist(): readonly string[] {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot,
    // The server has no storage, so it renders the empty list and the first client render
    // matches it. The effect below fills it in immediately afterwards.
    () => EMPTY,
  );

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return value;
}

export function toggleCompare(handle: string) {
  const current = read();
  snapshot = current;
  if (current.includes(handle)) {
    write(current.filter((entry) => entry !== handle));
  } else if (current.length < MAX_COMPARE) {
    write([...current, handle]);
  }
}

/**
 * The add/remove control, for a product page.
 *
 * The label changes rather than only the colour, and the pressed state is carried by
 * `aria-pressed`, so what it does and what it has done are both available without seeing it.
 * When the shortlist is full and this phone is not on it, the button says so instead of
 * silently doing nothing when pressed.
 */
export function CompareToggle({ handle, className = "" }: { handle: string; className?: string }) {
  const shortlist = useCompareShortlist();
  const selected = shortlist.includes(handle);
  const full = !selected && shortlist.length >= MAX_COMPARE;

  const onClick = useCallback(() => toggleCompare(handle), [handle]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={full}
      aria-pressed={selected}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-control)] border px-5 text-sm font-medium transition-all duration-200 [transition-timing-function:var(--ease-brand)] disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--surface)]"
          : "border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--text)] hover:bg-[var(--surface-sunken)]"
      } ${className}`}
    >
      {selected ? <IconCheck /> : <IconPlus />}
      {selected
        ? "On your comparison"
        : full
          ? `Comparison is full (${MAX_COMPARE})`
          : "Add to comparison"}
    </button>
  );
}

/**
 * The bar at the foot of the page.
 *
 * Hidden on `/compare` itself, where the URL is already showing the comparison and a tray
 * offering to open it would be a control that does nothing.
 */
export function CompareTray() {
  const shortlist = useCompareShortlist();
  const pathname = usePathname();

  if (shortlist.length === 0 || pathname === "/compare") return null;

  const slots = Array.from({ length: MAX_COMPARE }, (_, index) => shortlist[index] ?? null);
  const ready = shortlist.length >= 2;

  return (
    <div
      // A complementary landmark rather than an aside with no name: it is a persistent
      // region a screen reader user should be able to find and skip deliberately.
      role="complementary"
      aria-label="Your comparison"
      className="sticky bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          {/*
            The slots, drawn. Three boxes with the filled ones marked is a faster read than
            "2 of 3" alone, and the sentence beside it carries the same fact for anyone who
            cannot see them, so the shapes are hidden.
          */}
          <span aria-hidden="true" className="flex gap-1.5">
            {slots.map((handle, index) => (
              <span
                key={index}
                className={`h-7 w-7 rounded-[8px] border-2 transition-colors duration-300 [transition-timing-function:var(--ease-brand)] ${
                  handle
                    ? "border-[var(--text)] bg-[var(--text)]"
                    : "border-dashed border-[var(--line-strong)]"
                }`}
              />
            ))}
          </span>
          <p className="text-sm text-[var(--text-soft)]" aria-live="polite">
            <strong className="font-semibold text-[var(--text)]">
              {shortlist.length} of {MAX_COMPARE}
            </strong>{" "}
            {shortlist.length === 1 ? "phone picked" : "phones picked"}
            {!ready && ". Pick one more to compare."}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => write([])}
            className="nav-pill inline-flex min-h-[44px] items-center gap-1.5 px-3 text-sm text-[var(--text-soft)]"
          >
            <IconClose />
            Clear
          </button>
          {ready && (
            <Link
              href={buildCompareHref([...shortlist]) as Route}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-chip)] bg-[var(--text)] px-6 text-sm font-semibold text-[var(--surface)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-90"
            >
              <IconCompare />
              Compare {shortlist.length}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
