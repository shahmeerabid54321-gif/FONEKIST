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
