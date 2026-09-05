/**
 * The parts of the query both the server and the browser need.
 *
 * `lib/query.ts` reads and writes cookies, so it imports `next/headers`, which cannot be
 * bundled for the browser. The header badge is a client component and needs exactly two
 * things from it — the cap and the name of the count cookie, both constants — so they live
 * here and `lib/query.ts` re-exports them. Same split, and same reason, as
 * `lib/compare-shared.ts`.
 */

/**
 * Three, and there is no reward for filling it.
 *
 * An agreement covers exactly one handset (INST-005), so the query exists to choose between
 * a few phones, not to accumulate them: a fourth row would be a basket pretending to be a
 * decision. Three also keeps every row's full disclosure block, which is five figures and a
 * comparison, readable on a phone screen. The cap is a consequence of the layout and the
 * contract, not a target (ADR-003).
 */
export const MAX_QUERY = 3;

/** The shortlist itself. httpOnly: it is the capability, and it is never read by script. */
export const QUERY_COOKIE = "fk_query";

/**
 * A mirror of the count, and nothing else. Readable, because an integer between zero and
 * three is not a capability and the header badge needs it without making every page on the
 * site dynamic. Written only alongside `QUERY_COOKIE`, in `writeQuery`.
 */
export const QUERY_COUNT_COOKIE = "fk_query_n";

export const QUERY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
