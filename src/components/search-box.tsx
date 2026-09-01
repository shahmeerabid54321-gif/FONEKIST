"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { AutocompleteSuggestion } from "@/lib/pk";

/**
 * Search with type-ahead.
 *
 * Three behaviours that are easy to get wrong and matter here:
 *
 *  - **It is a real form.** Submitting without ever seeing a suggestion works, including
 *    with JavaScript disabled or still loading, because search is how people find a phone
 *    when the navigation has not helped.
 *  - **Suggestions never race ahead of the input.** Each request carries a sequence number
 *    and a late response for an older query is discarded, so the list cannot briefly show
 *    results for something the customer has already typed over.
 *  - **Whether the list is open is derived, not stored.** An `open` flag kept in state has
 *    to be cleared everywhere the query changes, and the one place it gets forgotten is the
 *    one where the list hangs over the page showing stale suggestions. Computing it during
 *    render makes that impossible.
 *
 * The combobox follows WAI-ARIA: the listbox is owned by the input, the active option is
 * announced through `aria-activedescendant`, and Escape returns to the plain input rather
 * than trapping focus.
 */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const sequence = useRef(0);

  const longEnough = query.trim().length >= 2;
  // Derived rather than stored, so it cannot survive a keystroke that invalidated it.
  const open = longEnough && !dismissed && suggestions.length > 0;

  useEffect(() => {
    if (query.trim().length < 2) return;

    const id = ++sequence.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
        const body = (await response.json()) as { suggestions?: AutocompleteSuggestion[] };
        // A response for an older keystroke must not overwrite a newer one.
        if (id !== sequence.current) return;
        setSuggestions(body.suggestions ?? []);
        setActive(-1);
      } catch {
        // Type-ahead is a convenience. A failure leaves the plain search box working.
        if (id === sequence.current) setSuggestions([]);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const go = (value: string) => {
    setDismissed(true);
    router.push(`/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        if (query.trim()) go(query.trim());
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search phones
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        value={query}
        placeholder="Search for a phone, brand or model"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-option-${active}` : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setDismissed(false);
          setActive(-1);
          // Cleared in the handler that invalidated them, not in an effect reacting to it.
          if (next.trim().length < 2) setSuggestions([]);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => Math.min(current + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, -1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            go(suggestions[active]!.text);
          } else if (event.key === "Escape") {
            setDismissed(true);
            setActive(-1);
          }
        }}
        // Full width of whatever the header gives it, capped, and tall enough to be a
        // comfortable tap target. It is the primary way people find a phone here.
        className="h-11 w-full max-w-lg rounded-[var(--radius-chip)] border border-[var(--line)] bg-[var(--surface-sunken)] px-5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--line-strong)] focus:bg-[var(--surface-raised)]"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute left-0 top-full z-50 mt-2 w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-lift)]"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.text}-${index}`}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={index === active}
              className={
                index === active
                  ? "cursor-pointer bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text)]"
                  : "cursor-pointer px-3 py-2 text-sm text-[var(--text-soft)]"
              }
              // `onMouseDown` rather than `onClick`: a click fires after blur, by which
              // point the list has closed and the option no longer exists.
              onMouseDown={(event) => {
                event.preventDefault();
                go(suggestion.text);
              }}
            >
              {suggestion.text}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
