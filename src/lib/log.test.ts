import { describe, expect, it } from "vitest";
import { degradeGracefully } from "./log";

/**
 * `degradeGracefully` exists so a failed non-critical read does not take down a page. The
 * danger is that it is *too* forgiving: Next steers rendering by throwing, and a catch-all
 * that eats those turns a redirect into a blank section.
 */
describe("degradeGracefully", () => {
  it("returns the fallback when the read genuinely fails", async () => {
    const result = await degradeGracefully("test.read", "fallback", async () => {
      throw new Error("commerce is down");
    });
    expect(result).toBe("fallback");
  });

  it("returns the value when the read succeeds", async () => {
    expect(await degradeGracefully("test.read", "fallback", async () => "value")).toBe("value");
  });

  it("rethrows Next's redirect signal", async () => {
    const redirect = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;replace;/x" });
    await expect(
      degradeGracefully("test.read", "fallback", async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });

  it("rethrows notFound", async () => {
    const notFound = Object.assign(new Error("nf"), { digest: "NEXT_NOT_FOUND" });
    await expect(
      degradeGracefully("test.read", "fallback", async () => {
        throw notFound;
      }),
    ).rejects.toBe(notFound);
  });

  it("rethrows the dynamic-rendering bailout", async () => {
    // Swallowing this one is silent: the page renders without the data it asked for and
    // logs an outage on every build that never actually happened.
    const bailout = Object.assign(new Error("dynamic"), { digest: "DYNAMIC_SERVER_USAGE" });
    await expect(
      degradeGracefully("test.read", "fallback", async () => {
        throw bailout;
      }),
    ).rejects.toBe(bailout);
  });

  it("rethrows a completed prerender's hanging-promise signal", async () => {
    // Cache Components rejects unfinished fetches with this digest when a prerender or
    // navigation no longer needs them. It is expected control flow, not a provider outage.
    const finished = Object.assign(new Error("prerender complete"), {
      digest: "HANGING_PROMISE_REJECTION",
    });
    await expect(
      degradeGracefully("test.read", "fallback", async () => {
        throw finished;
      }),
    ).rejects.toBe(finished);
  });

  it("rethrows an interrupted prerender signal", async () => {
    const interrupted = Object.assign(new Error("prerender interrupted"), {
      digest: "NEXT_PRERENDER_INTERRUPTED",
    });
    await expect(
      degradeGracefully("test.read", "fallback", async () => {
        throw interrupted;
      }),
    ).rejects.toBe(interrupted);
  });

  it("does not mistake an ordinary error carrying a digest for control flow", async () => {
    const real = Object.assign(new Error("boom"), { digest: "3771858665" });
    expect(
      await degradeGracefully("test.read", "fallback", async () => {
        throw real;
      }),
    ).toBe("fallback");
  });
});
