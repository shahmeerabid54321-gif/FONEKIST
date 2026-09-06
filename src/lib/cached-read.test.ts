import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/pk";

/**
 * `cacheLife` is only callable inside a real `use cache` scope, which a unit test does not
 * have. Mocked so the failure path's *decision* to shorten the entry can be asserted, which
 * is the part that matters: an outage held for an hour is the thing CLAUDE.md forbids.
 */
const cacheLife = vi.fn();
vi.mock("next/cache", () => ({ cacheLife: (...args: unknown[]) => cacheLife(...args), cacheTag: vi.fn() }));

const { capture, unwrap, CACHE_READ_DEADLINE_MS } = await import("./cached-read");

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The contract that keeps a deploy alive without letting the site lie.
 *
 * A `use cache` fill that throws fails the prerender of whichever page needed it, so the
 * fill has to complete. What it must never do is complete with a *fallback*, because a
 * fallback is then cached: an empty plan list becomes "this handset has no plans" for
 * everyone. So the fill stores the failure, and the throw happens outside the scope where
 * `degradeGracefully` has always handled it.
 */
describe("capture", () => {
  it("passes a successful read through untouched", async () => {
    const result = await capture(async () => ["a", "b"]);
    expect(result).toEqual({ ok: true, value: ["a", "b"] });
  });

  it("caches a genuine empty result as a real value, not a failure", async () => {
    const result = await capture(async () => []);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("records a failure as a failure rather than an empty success", async () => {
    cacheLife.mockClear();
    const result = await capture(async () => {
      throw new AppError("PROVIDER_UNAVAILABLE", { internal: { path: "/store/x" } });
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("PROVIDER_UNAVAILABLE");
    // The whole point: an outage is held for minutes, never the hour a good read earns.
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  /**
   * The failure the catch cannot see.
   *
   * A read that never settles never throws, so the fill hangs until Next's own stall timer
   * fires -- and that timer records the error on the work store, which fails the page's
   * prerender whether or not userland caught it. A deploy died exactly this way: the log
   * showed `installments.cheapest failed; rendering without it` and the build ended anyway.
   * The deadline is the only thing standing between a stalled read and a dead build.
   */
  it("records a stalled read as a failure instead of hanging the fill", async () => {
    vi.useFakeTimers();
    cacheLife.mockClear();

    // Never settles, the way the read that took the build down did not.
    const pending = capture(() => new Promise<string>(() => {}));

    await vi.advanceTimersByTimeAsync(CACHE_READ_DEADLINE_MS);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("PROVIDER_UNAVAILABLE");
    expect(result.internal).toMatchObject({ stalled: true });
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("gives a read that finishes inside the deadline its real value", async () => {
    vi.useFakeTimers();

    const pending = capture(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("in time"), CACHE_READ_DEADLINE_MS - 1_000);
        }),
    );

    await vi.advanceTimersByTimeAsync(CACHE_READ_DEADLINE_MS - 1_000);
    expect(await pending).toEqual({ ok: true, value: "in time" });
  });

  it("survives an unserialisable cause, which a cache entry could not hold", async () => {
    const result = await capture(async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      throw new AppError("PROVIDER_UNAVAILABLE", { internal: circular });
    });

    expect(result.ok).toBe(false);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  /**
   * Redirect and notFound are thrown, not returned. Storing one as a cached error would
   * turn a redirect into a permanent outage for that entry.
   */
  it("never swallows framework control flow", async () => {
    const redirect = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;push;/x;" });
    await expect(capture(async () => { throw redirect; })).rejects.toBe(redirect);
  });
});

describe("unwrap", () => {
  it("returns the value of a successful read", () => {
    expect(unwrap({ ok: true, value: 42 })).toBe(42);
  });

  /**
   * The error that comes back out is the one that went in, so every existing
   * `degradeGracefully` call site keeps matching on the same codes.
   */
  it("rethrows the original error outside the cache scope", () => {
    try {
      unwrap({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Store is slow.", internal: { path: "/store/x" } });
      throw new Error("unreachable");
    } catch (error) {
      expect(AppError.is(error)).toBe(true);
      expect((error as AppError).code).toBe("PROVIDER_UNAVAILABLE");
      expect((error as AppError).message).toBe("Store is slow.");
    }
  });
});
