/**
 * Query normalisation for search.
 *
 * CUST-003 asks for tolerance of realistic customer input: a typo, a missing hyphen, a
 * model number typed as one word. Normalisation handles the *deterministic* half of that
 * — case, punctuation and separators — so the fuzzy matching only has to absorb genuine
 * misspellings. Doing it here rather than in SQL keeps it unit-testable and keeps the
 * indexed text and the query text normalised by exactly the same code.
 */

/** Words that carry no discriminating signal in a product catalogue query. */
const STOP_WORDS = new Set(["the", "a", "an", "for", "with", "and", "of", "in", "to"]);

/** Lower-cases, strips punctuation and collapses whitespace. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks so an accented brand name matches its plain spelling.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * A model number is written half a dozen ways: "WH-1000XM6", "wh 1000xm6", "wh1000xm6".
 * Indexing the separator-free form alongside the spaced form makes all of them match
 * without any fuzzy scoring at all.
 */
export function compactAlphanumeric(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function tokenize(input: string): string[] {
  const tokens = normalizeText(input).split(" ").filter(Boolean);
  const meaningful = tokens.filter((token) => !STOP_WORDS.has(token));
  // If a query is nothing but stop words, keep them: an empty token list would match the
  // whole catalogue, which is worse than matching nothing useful.
  return meaningful.length > 0 ? meaningful : tokens;
}

/**
 * Builds the indexed text for one product. Both the spaced and the compact form of every
 * field go in, so "wh1000xm6" and "wh 1000 xm6" both hit the same document.
 */
export function buildSearchText(parts: {
  title: string;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  categories?: string[];
  attributeValues?: string[];
}): string {
  const fields = [
    parts.title,
    parts.brand ?? "",
    parts.model ?? "",
    parts.sku ?? "",
    ...(parts.categories ?? []),
    ...(parts.attributeValues ?? []),
  ].filter(Boolean);

  const spaced = normalizeText(fields.join(" "));

  const compacted = [parts.title, parts.model, parts.sku]
    .filter(Boolean)
    .map((value) => compactAlphanumeric(String(value)))
    .filter((value) => value.length > 2);

  return [spaced, ...new Set(compacted)].join(" ").trim();
}

/** True when the query looks like a model number or SKU rather than prose. */
export function looksLikeIdentifier(query: string): boolean {
  const compact = compactAlphanumeric(query);
  // Both letters and digits, no spaces once normalised: "wh1000xm6", "x1c-g11".
  return (
    compact.length >= 4 &&
    /[a-z]/.test(compact) &&
    /[0-9]/.test(compact) &&
    tokenize(query).length <= 3
  );
}
