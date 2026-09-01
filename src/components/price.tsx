import { formatPkr } from "@/lib/pk";

/**
 * A price, and the only place a compare-at figure is allowed to render.
 *
 * `compareAt` is drawn only when it is genuinely higher than what is being charged. There
 * is no "was" price invented from a list price nobody pays, no percentage badge, and no
 * strike-through on a number that was never the price. That rule lives here rather than in
 * every caller so it cannot be forgotten in one of them.
 */
export function Price({
  amount,
  compareAt = null,
  size = "base",
}: {
  amount: number;
  compareAt?: number | null;
  size?: "base" | "large" | "small";
}) {
  const scale =
    size === "large" ? "text-3xl" : size === "small" ? "text-sm" : "text-lg";

  const genuinelyHigher = compareAt != null && compareAt > amount;

  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={`${scale} font-semibold tracking-tight text-[var(--text)]`}>
        {formatPkr(amount)}
      </span>
      {genuinelyHigher && (
        <>
          <span className="text-sm text-[var(--text-muted)] line-through">
            {formatPkr(compareAt)}
          </span>
          {/*
            The saving is stated in rupees, not as a percentage. A percentage is the figure
            that gets inflated, and rupees is the number the customer actually keeps.
          */}
          <span className="text-sm font-medium text-[var(--color-amber-ink)]">
            Save {formatPkr(compareAt - amount)}
          </span>
        </>
      )}
    </p>
  );
}
