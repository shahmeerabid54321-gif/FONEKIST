#!/usr/bin/env node
/**
 * Waits for the commerce backend to answer before the build starts.
 *
 * **Why the build needs it at all.** Since the storefront started prerendering, `next build`
 * is a *reader* of the catalogue rather than just a compiler of it: fifty-eight pages are
 * generated from live product, category and installment data. A build against a backend that
 * is not answering does not produce a degraded site, it produces no site — every catalogue
 * read happens inside a `use cache` scope, and a scope that throws fails the prerender of
 * whichever page needed it.
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
 * **Why it fails the build rather than warning.** Continuing without a backend does not
 * produce a usable deploy; it produces the same failure a few minutes later wearing a much
 * worse error message. Failing here spends a few seconds and says exactly what is wrong.
 */
import process from "node:process";

const BASE_URL = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000";

/**
 * Long enough for a free instance to boot from cold, which is the case this exists for, and
 * bounded so a genuinely dead backend does not hold a deploy open indefinitely.
 */
const TOTAL_BUDGET_MS = Number(process.env.BACKEND_WAIT_TIMEOUT_MS ?? 180_000);

/** Per attempt. Generous: a waking instance often accepts the socket long before it replies. */
const ATTEMPT_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 3_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probe() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const startedAt = Date.now();
let attempts = 0;

while (Date.now() - startedAt < TOTAL_BUDGET_MS) {
  attempts += 1;
  if (await probe()) {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`backend: ready at ${BASE_URL} after ${seconds}s (${attempts} attempt(s))`);
    process.exit(0);
  }
  // Reported per attempt because on a cold instance this is the only sign of progress a
  // deploy log shows for the best part of a minute.
  console.log(`backend: no answer from ${BASE_URL}, retrying (attempt ${attempts})`);
  await sleep(RETRY_DELAY_MS);
}

console.error(
  `\nbackend: ${BASE_URL} did not answer within ${Math.round(TOTAL_BUDGET_MS / 1000)}s.\n\n` +
    "The storefront prerenders its pages from the commerce backend, so it cannot be built\n" +
    "without one. Check that the commerce service is deployed and healthy, and that\n" +
    "MEDUSA_BACKEND_URL points at it. Raise BACKEND_WAIT_TIMEOUT_MS if the instance is\n" +
    "simply slower than this to wake.\n",
);
process.exit(1);
