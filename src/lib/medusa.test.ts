import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cold-start retry tests.
 *
 * These pin the two properties that a production build depends on and that nothing else
 * checks, because both only misbehave when the backend is unreachable, which is precisely
 * the case no green test run ever exercises.
 *
 * A storefront deploy failed on exactly this: the ladder ran longer than the budget of the
 * `use cache` scope every catalogue read runs inside. The graceful fallbacks were all
 * correct and none of them was ever reached, because the fill was killed before our own
 * error handling could run -- and a killed fill fails the page whether or not the caller
 * catches it.
 *
 * The module keeps the wake claim in module scope, so each test imports it freshly.
 */

/** A fetch that never answers, so only the abort signal ever settles it. */
function hangingFetch() {
  return vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        reject(error);
      });
    });
  });
}

async function loadMedusa() {
  vi.resetModules();
  return import("./medusa");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("cold-start wake", () => {
  it("escalates a timed-out read to one longer attempt at runtime", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { medusaFetch } = await loadMedusa();
    const pending = medusaFetch("/store/product-categories").catch((error) => error);

    // First attempt gives up on the default budget and the wake is issued.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);

    // Second attempt is the wake, and it must abort before Next's fill ceiling.
    await vi.advanceTimersByTimeAsync(25_000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * The whole ladder, including the worst nested chain, has to land inside
   * `CACHE_READ_DEADLINE_MS` -- the deadline `capture` enforces inside the cache scope, not
   * Next's own stall timer behind it. That ordering is the design: the deadline records a
   * failure the page can degrade from, where the stall timer ends the build. So a ladder
   * that outlives the deadline turns a merely slow backend into a fatal one.
   */
  it("finishes the whole ladder inside the cached-read deadline", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { medusaFetch } = await loadMedusa();
    const started = Date.now();
    const pending = medusaFetch("/store/product-categories").catch((error) => error);

    // The full ladder: default budget, then the wake.
    await vi.advanceTimersByTimeAsync(8_000 + 25_000);
    await pending;

    // Worst nested chain is this ladder plus one fast failure, the cooldown having denied
    // a second wake to the outer scope.
    const { CACHE_READ_DEADLINE_MS } = await import("./cached-read");
    expect(Date.now() - started + 8_000).toBeLessThan(CACHE_READ_DEADLINE_MS);
  });

  /**
   * A write that timed out may well have been applied. Sending it again on the guess that
   * it was not is how a customer ends up with two applications (INST-007).
   */
  it("never escalates a write", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { medusaFetch } = await loadMedusa();
    const pending = medusaFetch("/store/installment-applications", {
      method: "POST",
      body: "{}",
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(8_000);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
