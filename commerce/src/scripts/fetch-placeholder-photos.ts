import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ExecArgs } from "@medusajs/framework/types";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import {
  EDITORIAL_PHOTOS,
  EDITORIAL_SIZE,
  PRODUCT_PHOTOS,
  PRODUCT_SIZE,
  unsplashUrl,
} from "./seed-data/photo-map";
import { reindexProducts } from "../lib/search-indexer";

/**
 * Downloads stand-in product photography and points the catalogue at it.
 *
 * See `seed-data/photo-map.ts` for what these are and why they are a launch blocker.
 *
 * Idempotent in the way that matters: a file already on disk is left alone, so re-running
 * repairs a partial download rather than refetching forty images. A product whose thumbnail
 * is *not* one of ours has been given real photography in the admin, and is never touched.
 */

interface ProductRow {
  id: string;
  handle: string;
  thumbnail: string | null;
}

/** A thumbnail we generated, and may therefore replace. Anything else is someone's upload. */
function isOurs(thumbnail: string | null): boolean {
  if (!thumbnail) return true;
  return thumbnail.startsWith("/media/products/");
}

async function exists(file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    // A zero-length file is a failed download, not a cached one.
    return info.size > 1024;
  } catch {
    return false;
  }
}

async function download(url: string, destination: string): Promise<number> {
  const response = await fetch(url, {
    headers: { "User-Agent": "pk-electronics-seed" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }

  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    throw new Error(`Expected an image from ${url}, got ${type}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength < 1024) {
    throw new Error(`Suspiciously small response (${body.byteLength} bytes) from ${url}`);
  }

  await writeFile(destination, body);
  return body.byteLength;
}

export default async function fetchPlaceholderPhotos({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // Development assets, not uploads: they live in the storefront's public directory rather
  // than behind the CDN path, which would imply they came from object storage.
  const mediaRoot =
    process.env.PLACEHOLDER_MEDIA_DIR ?? path.resolve(process.cwd(), "../storefront/public/media");

  const productsDir = path.join(mediaRoot, "products");
  const editorialDir = path.join(mediaRoot, "editorial");
  await mkdir(productsDir, { recursive: true });
  await mkdir(editorialDir, { recursive: true });

  const manifest: { file: string; source: string; note: string }[] = [];
  const failures: string[] = [];
  let downloaded = 0;
  let cached = 0;

  const fetchOne = async (
    id: string,
    destination: string,
    publicPath: string,
    size: { width: number; height: number },
  ): Promise<boolean> => {
    const source = unsplashUrl(id, size);
    manifest.push({
      file: publicPath,
      source,
      note: "Stand-in photograph of a representative device. Attribution unresolved; replace before launch.",
    });

    if (await exists(destination)) {
      cached += 1;
      return true;
    }

    try {
      await download(source, destination);
      downloaded += 1;
      return true;
    } catch (error) {
      failures.push(`${publicPath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  // ---- Editorial frames: used by the storefront's own layouts, not by a product. ----
  for (const [name, id] of Object.entries(EDITORIAL_PHOTOS)) {
    await fetchOne(
      id,
      path.join(editorialDir, `${name}.jpg`),
      `/media/editorial/${name}.jpg`,
      EDITORIAL_SIZE,
    );
  }

  // ---- Product photography. ----
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail"],
    pagination: { take: 1000, skip: 0 },
  });
  const products = data as unknown as ProductRow[];
  const byHandle = new Map(products.map((product) => [product.handle, product]));

  let linked = 0;
  const unmatched: string[] = [];

  for (const set of PRODUCT_PHOTOS) {
    const product = byHandle.get(set.handle);
    if (!product) {
      unmatched.push(set.handle);
      continue;
    }

    const directory = path.join(productsDir, set.handle);
    await mkdir(directory, { recursive: true });

    const urls: string[] = [];
    for (const [index, id] of set.photos.entries()) {
      const name = `${String(index + 1).padStart(2, "0")}.jpg`;
      const publicPath = `/media/products/${set.handle}/${name}`;
      const ok = await fetchOne(id, path.join(directory, name), publicPath, PRODUCT_SIZE);
      if (ok) urls.push(publicPath);
    }

    if (urls.length === 0) continue;

    // Real photography uploaded in the admin outranks anything here (ADR-012).
    if (!isOurs(product.thumbnail)) continue;

    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: product.id },
        update: { thumbnail: urls[0], images: urls.map((url) => ({ url })) },
      },
    });
    linked += 1;
  }

  await writeFile(
    path.join(mediaRoot, "media-manifest.json"),
    `${JSON.stringify(
      {
        generatedBy: "pnpm --filter commerce media:photos",
        warning:
          "Development stand-ins. Each shows a representative device, not the unit being sold. Replace with photography of real stock before launch.",
        files: manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // The search index stores the thumbnail, so it has to be rebuilt or every card keeps the
  // image it had before this ran.
  const { indexed } = await reindexProducts(container);

  logger.info(
    `Product photography: ${downloaded} downloaded, ${cached} already present, ` +
      `${linked} product(s) linked, ${indexed} document(s) reindexed.`,
  );

  if (unmatched.length > 0) {
    logger.warn(`No product for handle(s): ${unmatched.join(", ")}. Has the catalogue changed?`);
  }

  // Loud rather than silent: a half-illustrated catalogue looks like a bug, and the caller
  // needs to know which files to retry.
  if (failures.length > 0) {
    logger.error(`${failures.length} photo(s) could not be downloaded:\n  ${failures.join("\n  ")}`);
    throw new Error(`${failures.length} photo download(s) failed.`);
  }
}
