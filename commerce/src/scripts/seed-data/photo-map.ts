/**
 * Stand-in product photography.
 *
 * The catalogue has no photographs of real stock, and the generated SVG tiles in
 * `lib/placeholder-media.ts` cannot show whether a layout works: a design decided against
 * flat grey silhouettes is a design decided against nothing. These are real photographs of
 * the right *kind* of device, downloaded once into the storefront's public directory so the
 * storefront can be judged on how it actually looks.
 *
 * They are development assets and a documented launch blocker. Each one shows a
 * representative device, not the exact unit being sold, so shipping them to customers would
 * misrepresent the goods. `DEVELOPMENT.md` records this; replacing them is an upload, not a
 * code change (ADR-012).
 *
 * Attribution is deliberately left unresolved rather than invented: the manifest records the
 * source URL for every file, and real credit has to be looked up before any public use.
 */

export interface PhotoSet {
  /** Product handle, matching `seed-data/catalog.ts`. */
  handle: string;
  /** Unsplash photo identifiers, most representative first. The first becomes the thumbnail. */
  photos: string[];
}

/** Editorial frames used by the storefront's own layouts rather than by a product. */
export const EDITORIAL_PHOTOS: Record<string, string> = {
  // The homepage story band. Dark, dramatic, and it survives white text laid over it.
  "story-audio": "1599669454699-248893623440",
  // Category tiles.
  "category-laptops": "1593642632823-8f785ba67e45",
  "category-smartphones": "1610945415295-d9bbf067e59c",
  "category-audio": "1546435770-a3e426bf472b",

  // FONEKIST. The hero band lays large white type over these, so each one was chosen for
  // having a dark, uncluttered half to lay it over.
  "hero-flagship": "1610945415295-d9bbf067e59c",
  "hero-installments": "1601784551446-20c9e07cdbdb",
  "hero-value": "1621330396173-e41b1cafd17f",
  "brand-feature": "1583573636246-18cb2246697f",
};

export const PRODUCT_PHOTOS: PhotoSet[] = [
  // Laptops
  { handle: "macbook-air-15-m3", photos: ["1541807084-5c52b6b3adef", "1517336714731-489689fd1ca8", "1496181133206-80ce9b88a853"] },
  { handle: "dell-xps-13-9340", photos: ["1593642632823-8f785ba67e45", "1588872657578-7efd1f1555ed"] },
  { handle: "asus-rog-zephyrus-g14", photos: ["1606229365485-93a3b8ee0385", "1531297484001-80022131f5a1"] },
  { handle: "lenovo-thinkpad-x1-carbon-g12", photos: ["1588872657578-7efd1f1555ed", "1496181133206-80ce9b88a853"] },
  { handle: "hp-pavilion-plus-14", photos: ["1496181133206-80ce9b88a853", "1593642632823-8f785ba67e45"] },

  // Smartphones
  { handle: "samsung-galaxy-s24-ultra", photos: ["1610945415295-d9bbf067e59c", "1601784551446-20c9e07cdbdb"] },
  { handle: "apple-iphone-15-pro", photos: ["1592750475338-74b7b21085ab", "1574944985070-8f3ebc6b79d2", "1511385348-a52b4a160dc2"] },
  { handle: "google-pixel-8", photos: ["1601784551446-20c9e07cdbdb", "1580910051074-3eb694886505"] },
  { handle: "xiaomi-redmi-note-13-pro", photos: ["1511707171634-5f897ff02aa9", "1523206489230-c012c64b2b48"] },
  { handle: "samsung-galaxy-a55", photos: ["1580910051074-3eb694886505", "1511385348-a52b4a160dc2"] },

  // Audio
  { handle: "sony-wh-1000xm5", photos: ["1618366712010-f4ae9c647dcb", "1583394838336-acd977736f90"] },
  { handle: "sony-wh-1000xm6", photos: ["1546435770-a3e426bf472b", "1618366712010-f4ae9c647dcb"] },
  { handle: "apple-airpods-pro-2", photos: ["1590658268037-6bf12165a8df", "1600294037681-c80b4cb5b434"] },
  { handle: "bose-quietcomfort-ultra", photos: ["1583394838336-acd977736f90", "1505740420928-5e560c06d30e"] },
  { handle: "samsung-galaxy-buds3-pro", photos: ["1572569511254-d8f925fe2cbb", "1606220945770-b5b6c2c55bf1"] },
  { handle: "jbl-tune-770nc", photos: ["1505740420928-5e560c06d30e", "1484704849700-f032a568e944"] },
  { handle: "anker-soundcore-space-one", photos: ["1484704849700-f032a568e944", "1572569511254-d8f925fe2cbb"] },

  // FONEKIST handsets. Every id here was checked to resolve and was looked at before it was
  // assigned, so a card shows a device of roughly the right kind rather than a laptop or,
  // as two rejected candidates did, a rotary telephone and a Polaroid camera.
  { handle: "samsung-galaxy-s24", photos: ["1610945415295-d9bbf067e59c", "1583573636246-18cb2246697f", "1601784551446-20c9e07cdbdb"] },
  { handle: "samsung-galaxy-a35", photos: ["1583573636246-18cb2246697f", "1610945415295-d9bbf067e59c"] },
  { handle: "samsung-galaxy-a15", photos: ["1585060544812-6b45742d762f", "1583573636246-18cb2246697f"] },
  { handle: "apple-iphone-15", photos: ["1592750475338-74b7b21085ab", "1591337676887-a217a6970a8a", "1574944985070-8f3ebc6b79d2"] },
  { handle: "apple-iphone-13", photos: ["1616348436168-de43ad0db179", "1607936854279-55e8a4c64888"] },
  { handle: "xiaomi-14t-pro", photos: ["1621330396173-e41b1cafd17f", "1601784551446-20c9e07cdbdb"] },
  { handle: "redmi-note-14-pro-plus", photos: ["1601784551446-20c9e07cdbdb", "1621330396173-e41b1cafd17f"] },
  { handle: "redmi-13c", photos: ["1512054502232-10a0a035d672", "1621330396173-e41b1cafd17f"] },
  { handle: "poco-x6-pro", photos: ["1567581935884-3349723552ca", "1601784551446-20c9e07cdbdb"] },
  { handle: "infinix-note-40-pro", photos: ["1546054454-aa26e2b734c7", "1544866092-1935c5ef2a8f"] },
  { handle: "infinix-hot-50-pro", photos: ["1544866092-1935c5ef2a8f", "1546054454-aa26e2b734c7"] },
  { handle: "tecno-camon-30", photos: ["1565849904461-04a58ad377e0", "1523206489230-c012c64b2b48"] },
  { handle: "tecno-spark-20-pro", photos: ["1523206489230-c012c64b2b48", "1565849904461-04a58ad377e0"] },
  { handle: "vivo-v40", photos: ["1605236453806-6ff36851218e", "1585060544812-6b45742d762f"] },
  { handle: "vivo-y28", photos: ["1556656793-08538906a9f8", "1605236453806-6ff36851218e"] },
  { handle: "oppo-reno12", photos: ["1607936854279-55e8a4c64888", "1616348436168-de43ad0db179"] },
  { handle: "oppo-a3-pro", photos: ["1511707171634-5f897ff02aa9", "1607936854279-55e8a4c64888"] },
  { handle: "realme-12-pro-plus", photos: ["1573148195900-7845dcb9b127", "1546054454-aa26e2b734c7"] },
  { handle: "realme-c65", photos: ["1512941937669-90a1b58e7e9c", "1573148195900-7845dcb9b127"] },
  { handle: "google-pixel-8a", photos: ["1598965402089-897ce52e8355", "1533228100845-08145b01de14"] },
  { handle: "oneplus-nord-4", photos: ["1580910051074-3eb694886505", "1592750475338-74b7b21085ab"] },
];

/** Product shots are square so a grid of mixed photography stays visually even. */
export const PRODUCT_SIZE = { width: 1200, height: 1200 } as const;
/** Editorial frames are wide: they run full-bleed behind text. */
export const EDITORIAL_SIZE = { width: 2000, height: 1200 } as const;

export function unsplashUrl(id: string, size: { width: number; height: number }): string {
  const params = new URLSearchParams({
    w: String(size.width),
    h: String(size.height),
    fit: "crop",
    q: "80",
    fm: "jpg",
  });
  return `https://images.unsplash.com/photo-${id}?${params.toString()}`;
}
