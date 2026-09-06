#!/usr/bin/env node
/**
 * Waits for the commerce backend to answer before the build starts.
 *
 * **Why the build needs it at all.** Since the storefront started prerendering, `next build`
 * is a *reader* of the catalogue rather than just a compiler of it: fifty-eight pages are
 * generated from live product, category and installment data. A build against a backend that
 * is not answering no longer fails — ADR-004 saw to that — which is precisely why this guard
 * still matters. It now produces a *site*, and the site it produces tells every visitor the
 * catalogue is unreachable, from prerendered HTML, for as long as that HTML is cached. A
 * failed deploy is a smaller problem than a successful one that ships an outage.
 *
 * **Why that is a deploy problem specifically.** The backend runs on an instance that stops
 * when nothing has called it for a while and takes most of a minute to come back. Deploys are
 * exactly when nothing has called it for a while. So the storefront's build would routinely
 * be the thing that woke the backend, and would routinely fail while doing it, which is what
 * took a production deploy down: the logs were three minutes of graceful degradation
 * warnings followed by a cache-fill timeout, and none of it said "the backend is asleep".
 *
 * This script makes the wake an explicit, cheap, serial step that happens once, instead of an
 * accident distributed across fifty-eight page renders that each pay their own timeout.
 *
 * **Why it fails the build rather than warning.** Continuing without a backend produces a
 * deploy that is worse than no deploy, per above. Failing here says exactly what is wrong,
 * once, at the top of the log, instead of leaving it to be inferred from fifty-eight
 * degradation warnings.
 *
 * **Why it probes the store and not just `/health`.** See `STORE_PROBE_PATH` below: liveness
 * answers before the store path can, and a deploy was lost in that gap.
 */
import { existsSync } from "node:fs";
import process from "node:process";

/**
 * Reads `.env.local` the way the build itself does.
 *
 * A real environment variable always wins, which is the deployment case: Render sets
 * `MEDUSA_BACKEND_URL` in the build environment and no file is involved. Locally there is no
 * such variable and the URL lives in `.env.local`, which Next loads for the build but a plain
 * Node script does not. Without this the guard cheerfully probed `localhost:9000`, found the
 * development backend answering, and reported a backend the build was never going to use.
 */
if (!process.env.MEDUSA_BACKEND_URL && existsSync(".env.local")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // A malformed or unreadable file is not worth failing the build over: the probe below
    // falls back to the default origin and still reports honestly on whatever it reaches.
  }
}

const BASE_URL = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * The read the build actually starts with, and the reason `/health` alone is not enough.
 *
 * `/health` is a liveness check: it answers as soon as the HTTP server is listening, before
 * the commerce modules have a database connection or a query plan. A deploy proved the gap.
 * The probe reported the backend ready, the build began, and the first real catalogue read
 * -- this exact URL -- spent eight seconds, escalated, spent twenty-five more and gave up,
 * because the store path was still cold while liveness had been green for a minute.
 *
 * Warming it here costs one serial request against no deadline at all. Leaving it to the
 * build spends it inside a `use cache` fill, where it is charged against a budget and can
 * fail a page instead of just being slow.
 *
 * It is also the only probe that can see a wrong publishable key. `/health` does not take
 * one, so a bad key passes liveness and then fails every read of the build.
 */
const STORE_PROBE_PATH = "/store/product-categories?limit=1";

/**
 * Long enough for a free instance to boot from cold, which is the case this exists for, and
 * bounded so a genuinely dead backend does not hold a deploy open indefinitely.
 */
const TOTAL_BUDGET_MS = Number(process.env.BACKEND_WAIT_TIMEOUT_MS ?? 180_000);

/** Per attempt. Generous: a waking instance often accepts the socket long before it replies. */
const ATTEMPT_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 3_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One attempt. Returns the status, or null when nothing answered inside the attempt budget. */
async function probe(path, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, { headers, signal: controller.signal });
    // The body is read and discarded on purpose: a backend that has sent headers but cannot
    // produce a row is not warm, and this is the cheapest way to make it prove otherwise.
    await response.arrayBuffer();
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const startedAt = Date.now();

/** Retries `path` until it answers acceptably or the shared budget runs out. */
async function waitFor(label, path, headers, accept) {
  let attempts = 0;
  while (Date.now() - startedAt < TOTAL_BUDGET_MS) {
    attempts += 1;
    const status = await probe(path, headers);

    if (status !== null && accept(status)) {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`backend: ${label} at ${BASE_URL} after ${seconds}s (${attempts} attempt(s))`);
      return status;
    }

    // A backend that answers and refuses is a different problem from one that does not answer,
    // and retrying is only right for the second. Any 4xx here means the request itself is
    // wrong -- Medusa rejects an unrecognised publishable key with 400, not 401 -- so waiting
    // changes nothing and every catalogue read of the build would fail identically. 429 is the
    // exception: it is the backend asking us to wait, which is what this loop already does.
    if (status !== null && status >= 400 && status < 500 && status !== 429) {
      console.error(
        `\nbackend: ${BASE_URL}${path} answered ${status}.\n\n` +
          "The backend is up and rejected the request, so this is not a cold start and\n" +
          "waiting will not fix it. For a store path the usual cause is\n" +
          "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: check it against a key published to the\n" +
          "FONEKIST sales channel, since an unrecognised key is a 400 rather than a 401.\n",
      );
      process.exit(1);
    }

    // Reported per attempt because on a cold instance this is the only sign of progress a
    // deploy log shows for the best part of a minute.
    console.log(
      `backend: ${path} ${status === null ? "did not answer" : `answered ${status}`}` +
        `, retrying (attempt ${attempts})`,
    );
    await sleep(RETRY_DELAY_MS);
  }

  console.error(
    `\nbackend: ${BASE_URL}${path} did not answer within ${Math.round(TOTAL_BUDGET_MS / 1000)}s.\n\n` +
      "The storefront prerenders its pages from the commerce backend, so building without\n" +
      "one produces a site that asserts an outage on every page for as long as it is cached.\n" +
      "Check that the commerce service is deployed and healthy, that MEDUSA_BACKEND_URL\n" +
      "points at it, and that this build container can reach that host at all. Raise\n" +
      "BACKEND_WAIT_TIMEOUT_MS if the instance is simply slower than this to wake.\n",
  );
  process.exit(1);
}

// Liveness first: until the process is listening there is nothing to ask about the store.
await waitFor("listening", "/health", undefined, (status) => status >= 200 && status < 500);

if (!PUBLISHABLE_KEY) {
  console.error(
    "\nbackend: NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is not set.\n\n" +
      "Every store read of the build sends it, so the build would fail one page at a time\n" +
      "instead of once, here.\n",
  );
  process.exit(1);
}

// Then the path the build will actually use, so the cold query is paid here rather than
// inside a cache fill that is on a budget.
await waitFor("store ready", STORE_PROBE_PATH, { "x-publishable-api-key": PUBLISHABLE_KEY }, (
  status,
) => status === 200);

process.exit(0);
