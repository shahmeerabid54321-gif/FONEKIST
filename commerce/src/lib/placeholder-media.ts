/**
 * Generated placeholder product imagery.
 *
 * The catalogue has no photography, and a grid of empty image frames reads as a broken
 * site rather than as an incomplete one. These tiles fill the frame with something
 * deliberate: the brand, the model and a category silhouette, drawn in the design system's
 * neutrals.
 *
 * They are labelled "Placeholder image" on the tile itself, on purpose. An unlabelled
 * generated tile is the first step toward shipping one to a customer by accident, and
 * PRD section 8 rules out presenting anything as more real than it is. They are replaced
 * by uploading real photography (ADR-012); nothing else has to change.
 */

export type DeviceShape = "laptop" | "phone" | "headphones" | "earbuds" | "generic";

/** Picks the silhouette from the category handles a product belongs to. */
export function deviceShapeFor(categoryHandles: string[]): DeviceShape {
  const handles = categoryHandles.map((handle) => handle.toLowerCase());

  if (handles.some((handle) => handle.includes("earbud"))) return "earbuds";
  if (handles.some((handle) => handle.includes("headphone"))) return "headphones";
  if (handles.some((handle) => handle.includes("phone"))) return "phone";
  if (handles.some((handle) => handle.includes("laptop") || handle.includes("ultrabook") || handle.includes("gaming"))) {
    return "laptop";
  }
  if (handles.some((handle) => handle.includes("audio"))) return "headphones";
  return "generic";
}

/** Neutral enough to sit behind real photography later without the grid changing character. */
const PALETTE = {
  background: "#F1F3F6",
  edge: "#D7DBE2",
  ink: "#5A6472",
  inkStrong: "#333B47",
  screen: "#E4E8EE",
};

const SILHOUETTES: Record<DeviceShape, string> = {
  laptop: `
    <rect x="150" y="230" width="500" height="310" rx="18" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <rect x="182" y="262" width="436" height="246" rx="8" fill="${PALETTE.background}"/>
    <path d="M104 556 h592 a24 24 0 0 1 -24 34 H128 a24 24 0 0 1 -24 -34 z" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <rect x="352" y="562" width="96" height="8" rx="4" fill="${PALETTE.edge}"/>
  `,
  phone: `
    <rect x="288" y="150" width="224" height="500" rx="34" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <rect x="310" y="186" width="180" height="428" rx="18" fill="${PALETTE.background}"/>
    <rect x="366" y="162" width="68" height="10" rx="5" fill="${PALETTE.edge}"/>
    <circle cx="400" cy="632" r="9" fill="${PALETTE.edge}"/>
  `,
  headphones: `
    <path d="M200 430 v-40 a200 200 0 0 1 400 0 v40" fill="none" stroke="${PALETTE.edge}" stroke-width="26" stroke-linecap="round"/>
    <rect x="152" y="410" width="104" height="170" rx="42" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <rect x="544" y="410" width="104" height="170" rx="42" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
  `,
  earbuds: `
    <circle cx="300" cy="360" r="74" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <path d="M282 424 v92 a26 26 0 0 0 52 0 v-92" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <circle cx="500" cy="360" r="74" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <path d="M482 424 v92 a26 26 0 0 0 52 0 v-92" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
  `,
  generic: `
    <rect x="220" y="220" width="360" height="360" rx="28" fill="${PALETTE.screen}" stroke="${PALETTE.edge}" stroke-width="6"/>
    <circle cx="400" cy="400" r="86" fill="none" stroke="${PALETTE.edge}" stroke-width="10"/>
  `,
};

export interface PlaceholderInput {
  title: string;
  brand: string | null;
  model: string | null;
  shape: DeviceShape;
}

/** Escapes text for XML. A model number with an ampersand would otherwise break the file. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderPlaceholderSvg(input: PlaceholderInput): string {
  const brand = escapeXml((input.brand ?? "").toUpperCase());
  const model = escapeXml(input.model ?? input.title);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${escapeXml(input.title)} placeholder image">
  <rect width="800" height="800" fill="${PALETTE.background}"/>
  ${SILHOUETTES[input.shape]}
  <text x="400" y="112" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="30" font-weight="600" letter-spacing="6" fill="${PALETTE.inkStrong}">${brand}</text>
  <text x="400" y="700" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="28" fill="${PALETTE.ink}">${model}</text>
  <text x="400" y="742" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="18" letter-spacing="2" fill="${PALETTE.edge}">PLACEHOLDER IMAGE</text>
</svg>
`;
}
