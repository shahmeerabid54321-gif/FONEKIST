/**
 * Builds the responsive image ladder that `components/photo.tsx` serves from.
 *
 * **Why this exists.** `next.config.ts` sets `images.unoptimized`, and the reasoning behind
 * it is sound: running twenty-four catalogue tiles through Next's on-demand transformer is a
 * twenty-four request CPU spike, and on a 0.1-CPU instance that is the whole storefront
 * timing out. But `unoptimized` also makes `sizes`, `formats` and the entire srcset machinery
 * inert, so a phone on a Pakistani mobile connection downloaded the full desktop JPG: 209 KB
 * for a tile drawn at roughly 180 CSS pixels, twenty-four times over.
 *
 * Neither answer was acceptable, because both treat this as a request-time question. It is
 * not. The photographs are committed files that change when somebody replaces them, so the
 * resizing belongs here, at build time, where it is paid once instead of per visitor. The
 * server stays out of it entirely: nothing is transformed on demand, `/_next/image` is never
 * involved, and the free-tier constraint that motivated `unoptimized` is untouched.
 *
 * Measured on `samsung-galaxy-a15/01.jpg` (1200x1200, 209.5 KB):
 *
 *   width   AVIF     WebP     source
 *   320     4.8 KB   4.8 KB   209.5 KB
 *   640    14.3 KB  18.3 KB
 *   960    37.2 KB  39.1 KB
 *   1280   48.3 KB  59.5 KB
 *
 * A catalogue tile asks for 320 or 640. That is the ninety-plus per cent.
 *
 * **Why both formats.** AVIF is smaller than WebP at every width here, but it is not
 * universal, and a `<source>` a browser cannot decode is a broken image rather than a
 * fallback: `<picture>` chooses on the declared type, it does not retry on failure. So each
 * image is emitted twice and the browser picks. The original JPG stays as the `<img>` src,
 * which is what a browser with neither format gets.
 *
 * **Why it is a hard build step rather than a best-effort one.** `mediaSources` derives the
 * derivative paths by rule, not from a manifest, so that no lookup table has to be shipped
 * to the browser. The rule assumes the files exist. If this script does not run, those URLs
 * 404 and the catalogue renders blank tiles, so a missing `sharp` has to fail the build
 * loudly here rather than quietly at a customer.
 *
 * **Why the ladder is committed and this is usually a no-op.** Encoding all of it takes about
 * seventy seconds on eight cores, and the deploy target is a free instance with a fraction of
 * one. Paying that on every deploy is the difference between a build that finishes and a
 * build that times out, so the output is committed beside the photographs it comes from and
 * this script's job on a deploy is to confirm it is current.
 *
 * That confirmation is a content hash, not a timestamp. A fresh `git clone` writes every file
 * at the same moment in arbitrary order, so an mtime comparison would re-encode the whole
 * ladder on a CI machine at random, which is exactly where it must not happen.
 */
import { readdir, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import sharp from "sharp";

/**
 * The ladder, and it is deliberately short.
 *
 * These are the widths `mediaSrcSet` names, so every one of them must exist for every
 * source. Four is enough to cover the three shapes on this site: a 96px basket thumbnail
 * takes 320, a catalogue tile at 2x takes 640, a product gallery at 2x takes 960 or 1280,
 * and a full-bleed hero takes 1280. Adding a fifth would multiply the build for widths
 * nothing asks for.
 *
 * The product photography is 1200px square, so 1280 upscales; `withoutEnlargement` stops it
 * and the file is emitted at 1200 instead. The srcset then overstates that entry by 6%,
 * which costs a browser nothing: it is the largest thing we hold either way.
 */
const WIDTHS = [320, 640, 960, 1280];

/*
 * Quality, chosen by measurement rather than by the usual defaults.
 *
 * AVIF at 50 is smaller than WebP at 72 at every width on this material and is
 * indistinguishable on a phone. `effort: 4` is the knee of the curve: effort 6 took four
 * times as long and, at 1280, produced a *larger* file on one of the two samples.
 */
const AVIF = { quality: 50, effort: 4 };
const WEBP = { quality: 72, effort: 5 };

const MEDIA_DIR = path.resolve(process.cwd(), "public/media");
const DERIVED_DIR = path.join(MEDIA_DIR, "derived");

/** Everything under `public/media` that is a photograph. SVG placeholders are vector and
 * already smaller than any derivative would be, so they are left alone and `<Photo>` serves
 * them directly. */
async function findSources(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === DERIVED_DIR) continue;
      found.push(...(await findSources(full)));
    } else if (/\.jpe?g$/i.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** True when the file is there at all. Whether it is *current* is the hash's job. */
async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function derive(source, recordedHash) {
  const relative = path.relative(MEDIA_DIR, source);
  const stem = relative.replace(/\.jpe?g$/i, "");
  const bytesIn = await readFile(source);
  const hash = createHash("sha256").update(bytesIn).digest("hex").slice(0, 16);
  const unchanged = recordedHash === hash;

  let written = 0;
  let bytes = 0;

  for (const width of WIDTHS) {
    for (const [extension, encode] of [
      ["avif", (pipeline) => pipeline.avif(AVIF)],
      ["webp", (pipeline) => pipeline.webp(WEBP)],
    ]) {
      const target = path.join(DERIVED_DIR, `${stem}-${width}.${extension}`);

      if (unchanged && (await exists(target))) {
        bytes += (await stat(target)).size;
        continue;
      }

      await mkdir(path.dirname(target), { recursive: true });
      const info = await encode(
        sharp(source).resize({ width, withoutEnlargement: true }),
      ).toFile(target);
      written += 1;
      bytes += info.size;
    }
  }

  return { written, bytes, sourceBytes: bytesIn.length, relative, hash };
}

/** A fixed pool rather than `Promise.all` over ninety files: libvips is already threaded,
 * and letting every encode start at once on a small machine is how a build gets killed. */
async function run(tasks, concurrency) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

const started = Date.now();
const sources = await findSources(MEDIA_DIR);

const MANIFEST = path.join(DERIVED_DIR, "derived-manifest.json");

/** What the committed ladder was built from. Absent or unreadable means "rebuild it all". */
const recorded = await readFile(MANIFEST, "utf8")
  .then((raw) => JSON.parse(raw).hashes ?? {})
  .catch(() => ({}));

if (sources.length === 0) {
  console.log("derive:media found no photographs under public/media");
  process.exit(0);
}

const results = await run(
  sources.map((source) => () => derive(source, recorded[path.relative(MEDIA_DIR, source)])),
  Math.max(1, os.availableParallelism?.() ?? 4),
);

const written = results.reduce((total, result) => total + result.written, 0);
const derivedBytes = results.reduce((total, result) => total + result.bytes, 0);
const sourceBytes = results.reduce((total, result) => total + result.sourceBytes, 0);

/*
 * What the ladder was built from, so the next run can tell current from stale without
 * decoding anything. Nothing reads this at runtime: `mediaSources` works by rule precisely so
 * that no manifest has to reach a browser.
 *
 * `generatedAt` is deliberately absent. This file is committed, and a timestamp that changes
 * on every run would put a diff in every commit that touched no photograph.
 */
await writeFile(
  MANIFEST,
  `${JSON.stringify(
    {
      widths: WIDTHS,
      formats: ["avif", "webp"],
      sources: sources.length,
      sourceBytes,
      derivedBytes,
      hashes: Object.fromEntries(
        results.map((result) => [result.relative, result.hash]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      ),
    },
    null,
    2,
  )}\n`,
);

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(
  `derive:media ${sources.length} photographs, ${WIDTHS.length} widths x 2 formats, ` +
    `${written} encoded (${sources.length * WIDTHS.length * 2 - written} already current), ` +
    `${mb(sourceBytes)} of source -> ${mb(derivedBytes)} of ladder, ${Date.now() - started}ms`,
);
