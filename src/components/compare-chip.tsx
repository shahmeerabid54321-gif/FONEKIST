"use client";

import { useCompareShortlist, toggleCompare } from "./compare-tray";
import { IconCheck, IconPlus } from "./icons";

/**
 * The shortlist control as it appears on a grid card.
 *
 * Distinct from `CompareToggle` on the product page, which is a full-width labelled button:
 * a card has no room for one, and a row of six of them would be the loudest thing in the
 * grid. This is a 36px circle over the photograph.
 *
 * It is still a real button with a real accessible name. The name says which phone it acts
 * on ("Add Samsung Galaxy S24 to comparison") because a screen reader user moving through a
 * grid meets six of these in a row and "Add to comparison" six times identifies none of them.
 */
export function CompareChip({ handle, title }: { handle: string; title: string }) {
  const shortlist = useCompareShortlist();
  const selected = shortlist.includes(handle);

  return (
    <button
      type="button"
      onClick={() => toggleCompare(handle)}
      aria-pressed={selected}
      aria-label={
        selected ? `Remove ${title} from comparison` : `Add ${title} to comparison`
      }
      className={`grid h-9 w-9 place-items-center rounded-full border shadow-[var(--shadow-card)] transition-all duration-200 [transition-timing-function:var(--ease-brand)] ${
        selected
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--surface)]"
          : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-sunken)]"
      }`}
    >
      {selected ? <IconCheck className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
    </button>
  );
}
