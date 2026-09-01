import Image from "next/image";
import { mediaUrl } from "@/lib/media";

/**
 * The PDP gallery.
 *
 * A scroll-snap track with anchor thumbnails: no client JavaScript, keyboard operable, and
 * the aspect ratio is fixed so an image load cannot shift the page (CLS).
 *
 * `tabIndex={0}` on the track is load-bearing rather than decoration. A horizontally
 * scrollable region that nothing inside it can focus is unreachable by keyboard, which is
 * what axe's scrollable-region-focusable rule catches; making the track focusable lets
 * arrow keys pan it.
 */
export function ProductGallery({
  images,
  title,
}: {
  images: { id: string; url: string }[];
  title: string;
}) {
  const resolved = images
    .map((image) => ({ ...image, url: mediaUrl(image.url) }))
    .filter((image): image is { id: string; url: string } => Boolean(image.url));

  if (resolved.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-[var(--radius-card)] bg-[var(--surface-tile)] text-[var(--text-muted)]">
        No photograph available yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[var(--radius-card)] bg-[var(--surface-tile)]"
        tabIndex={0}
        role="group"
        aria-label={`${title} images`}
      >
        {resolved.map((image, index) => (
          <div
            key={image.id}
            id={`image-${image.id}`}
            className="relative aspect-square w-full shrink-0 snap-center"
          >
            <Image
              src={image.url}
              alt={index === 0 ? title : `${title}, view ${index + 1}`}
              fill
              // The first image is the largest contentful paint on this page.
              priority={index === 0}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {resolved.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {resolved.map((image, index) => (
            <li key={image.id} className="shrink-0">
              <a
                href={`#image-${image.id}`}
                className="relative block h-20 w-20 overflow-hidden rounded-[var(--radius-media)] bg-[var(--surface-tile)]"
              >
                <Image src={image.url} alt="" fill sizes="80px" className="object-cover" />
                <span className="sr-only">Show view {index + 1}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
