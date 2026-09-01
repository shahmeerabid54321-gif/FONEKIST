import type { MetadataRoute } from "next";

/**
 * The installable manifest.
 *
 * A phone shop is browsed on a phone, and a customer who adds the site to their home screen
 * should get the mark on a black tile rather than a screenshot of the page.
 *
 * Two 512s, because they are two different drawings. `any` is the tile as designed, with
 * its own rounded corners. `maskable` is the same mark with far more room around it,
 * because Android crops a maskable icon to whatever shape the launcher uses and anything
 * near the edge is lost. Shipping one icon for both roles is what produces either a clipped
 * mark or a rounded rectangle floating inside another rounded rectangle.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FONEKIST, phones in Pakistan",
    short_name: "FONEKIST",
    description:
      "Buy phones in Pakistan with PTA status, warranty and delivery stated on every listing.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0c0e",
    theme_color: "#0b0c0e",
    lang: "en-PK",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
