import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ExecArgs } from "@medusajs/framework/types";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { deviceShapeFor, renderPlaceholderSvg } from "../lib/placeholder-media";
import { reindexProducts } from "../lib/search-indexer";

/**
 * Writes a placeholder image for every product and points the catalogue at it.
 *
 * Media is a Phase 1 epic and object storage is ADR-012's eventual home for it. Until real
 * photography and an S3/R2 bucket exist, this fills the gap with tiles that are obviously
 * generated — see `lib/placeholder-media.ts` for why they are labelled as such.
 *
 * Idempotent: it only sets a thumbnail on products that have none, so uploading a real
 * photograph in the admin is never overwritten by re-running this.
 */

interface ProductRow {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  metadata: Record<string, unknown> | null;
  categories: { handle: string }[];
  images: { url: string }[];
}

export default async function generatePlaceholderMedia({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // Written into the storefront's public directory: these are development assets, not
  // uploads, and putting them behind the CDN path would imply they came from object storage.
  const outputDir =
    process.env.PLACEHOLDER_MEDIA_DIR ??
    path.resolve(process.cwd(), "../storefront/public/media/products");

  await mkdir(outputDir, { recursive: true });

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "metadata", "images.url", "categories.handle"],
    pagination: { take: 1000, skip: 0 },
  });

  const products = data as unknown as ProductRow[];

  let written = 0;
  let linked = 0;

  for (const product of products) {
    const shape = deviceShapeFor(product.categories.map((category) => category.handle));
    const svg = renderPlaceholderSvg({
      title: product.title,
      brand: typeof product.metadata?.brand === "string" ? product.metadata.brand : null,
      model: typeof product.metadata?.model === "string" ? product.metadata.model : null,
      shape,
    });

    await writeFile(path.join(outputDir, `${product.handle}.svg`), svg, "utf8");
    written += 1;

    const url = `/media/products/${product.handle}.svg`;

    // Never overwrite real photography (ADR-012): a product that already has a thumbnail
    // has been given one deliberately.
    if (product.thumbnail) continue;

    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: product.id },
        update: { thumbnail: url, images: [{ url }] },
      },
    });
    linked += 1;
  }

  // The index stores the thumbnail, so it has to be rebuilt or every card keeps its
  // empty frame until the next reconciliation.
  const { indexed } = await reindexProducts(container);

  logger.info(
    `Placeholder media: ${written} file(s) written to ${outputDir}, ${linked} product(s) linked, ${indexed} document(s) reindexed.`,
  );
}
