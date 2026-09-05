import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The base URL is read at module load, so each case re-imports with its own environment.
 */
async function load(base: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", base);
  return (await import("./media")).mediaUrl;
}

describe("mediaUrl", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("returns null for absent media", async () => {
    const mediaUrl = await load("");
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
    expect(mediaUrl("")).toBeNull();
    expect(mediaUrl("   ")).toBeNull();
  });

  it("leaves a relative path alone when no base is configured", async () => {
    const mediaUrl = await load("");
    expect(mediaUrl("/media/products/x/01.jpg")).toBe("/media/products/x/01.jpg");
  });

  it("prefixes a relative path with the configured base", async () => {
    const mediaUrl = await load("http://localhost:3000");
    expect(mediaUrl("/media/products/x/01.jpg")).toBe(
      "http://localhost:3000/media/products/x/01.jpg",
    );
  });

  it("joins with exactly one slash however the two sides are written", async () => {
    const mediaUrl = await load("http://localhost:3000/");
    expect(mediaUrl("media/x.jpg")).toBe("http://localhost:3000/media/x.jpg");
    expect(mediaUrl("/media/x.jpg")).toBe("http://localhost:3000/media/x.jpg");
  });

  it("returns an absolute URL untouched, so a CDN migration is a no-op", async () => {
    const mediaUrl = await load("http://localhost:3000");
    expect(mediaUrl("https://cdn.example.pk/x.jpg")).toBe("https://cdn.example.pk/x.jpg");
  });
});

/**
 * `mediaSources` derives its derivative paths by rule rather than from a manifest, so that no
 * lookup table has to be shipped to a browser. That rule is a contract with
 * `scripts/derive-media.mjs`: if the two disagree about where a file lives or how it is
 * named, every photograph on the site 404s. These cases are that contract written down.
 */
async function loadSources(base: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", base);
  return (await import("./media")).mediaSources;
}

describe("mediaSources", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("returns null for absent media, so a card can render without a photograph", async () => {
    const mediaSources = await loadSources("");
    expect(mediaSources(null)).toBeNull();
    expect(mediaSources("  ")).toBeNull();
  });

  it("names every width in the ladder, in both formats", async () => {
    const mediaSources = await loadSources("");
    const sources = mediaSources("/media/products/x/01.jpg");

    expect(sources?.src).toBe("/media/products/x/01.jpg");
    expect(sources?.avif).toBe(
      "/media/derived/products/x/01-320.avif 320w, " +
        "/media/derived/products/x/01-640.avif 640w, " +
        "/media/derived/products/x/01-960.avif 960w, " +
        "/media/derived/products/x/01-1280.avif 1280w",
    );
    expect(sources?.webp).toContain("/media/derived/products/x/01-640.webp 640w");
  });

  it("offers no ladder for an SVG placeholder, which is vector and already smaller", async () => {
    const mediaSources = await loadSources("");
    const sources = mediaSources("/media/products/x.svg");
    expect(sources).toEqual({ src: "/media/products/x.svg", avif: null, webp: null });
  });

  it("keeps the derivatives beside the originals behind the CDN (ADR-012)", async () => {
    const mediaSources = await loadSources("https://cdn.example.pk");
    const sources = mediaSources("/media/products/x/01.jpg");
    expect(sources?.src).toBe("https://cdn.example.pk/media/products/x/01.jpg");
    expect(sources?.avif).toContain("https://cdn.example.pk/media/derived/products/x/01-320.avif 320w");
  });

  it("accepts an already-resolved URL, because callers resolve at different depths", async () => {
    const mediaSources = await loadSources("https://cdn.example.pk");
    const once = mediaSources("/media/products/x/01.jpg");
    const twice = mediaSources("https://cdn.example.pk/media/products/x/01.jpg");
    expect(twice).toEqual(once);
  });

  it("leaves a foreign origin alone: it is not ours to have processed", async () => {
    const mediaSources = await loadSources("");
    expect(mediaSources("https://elsewhere.example/photo.jpg")).toEqual({
      src: "https://elsewhere.example/photo.jpg",
      avif: null,
      webp: null,
    });
  });
});
