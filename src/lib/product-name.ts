/**
 * How a phone is named on a card.
 *
 * The catalog carries two names and they are not interchangeable. `title` is the marketing
 * name a customer searches for ("Samsung Galaxy S24 Ultra"); `model` is the exact model
 * code that identifies the physical device ("SM-S928B"). A card needs both: the name to be
 * recognised, the code because the same marketing name covers different hardware in
 * different markets, and knowing which one you are buying is the point.
 *
 * The card already prints the brand above the name, so repeating it in the heading wastes
 * the most valuable line on the card. Stripped only when the title genuinely starts with
 * the brand, so "Xiaomi Redmi Note 13 Pro" becomes "Redmi Note 13 Pro" while a title that
 * merely mentions the brand later is left alone.
 */
export function displayName(title: string, brand: string | null): string {
  if (!brand) return title;

  const prefix = `${brand} `;
  if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
    const stripped = title.slice(prefix.length).trim();
    // Never strip down to nothing: a product titled exactly with its brand keeps its title.
    return stripped.length > 0 ? stripped : title;
  }

  return title;
}
