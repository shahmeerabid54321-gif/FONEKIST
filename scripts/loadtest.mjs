#!/usr/bin/env node
/**
 * Load test for the storefront.
 *
 * The question this answers is not "how fast is one page" but "how many people can be on
 * the site at once before it stops answering". Those are different questions and the second
 * one is the one that matters, because the failure this exists to catch is the site falling
 * over under a rush rather than a page being a hundred milliseconds slow.
 *
 * **Concurrent users, not requests per second.** People do not request pages continuously;
 * they read a page, then click. With `THINK_TIME_S` seconds between clicks, one visitor
 * generates one request every `THINK_TIME_S` seconds, so a sustained rate of R req/s
 * supports roughly `R x THINK_TIME_S` concurrent visitors. Ten seconds is a deliberately
 * conservative figure for a shop where people compare handsets and read plan disclosures.
 *
 * **Run it against a production build.** `next dev` compiles routes on demand and recompiles
 * on change; measuring it tells you about the compiler, not the site. The script refuses to
 * run against a server that does not look like `next start`.
 *
 * Usage:
 *   pnpm build && pnpm start          # terminal 1
 *   pnpm loadtest                     # terminal 2
 *   CONNECTIONS=1000 DURATION=30 pnpm loadtest
 *   TARGET=http://localhost:3001 pnpm loadtest
 *   MIN_RPS_STATIC=600 MIN_RPS_STREAMED=140 pnpm loadtest
 */

import autocannon from "autocannon";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import os from "node:os";

function positiveNumber(value, name, { integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isSafeInteger(parsed))) {
    const expected = integer ? "a positive integer" : "a positive number";
    console.error(`${name} must be ${expected}; received ${JSON.stringify(value)}`);
    process.exit(1);
  }
  return parsed;
}

const TARGET = process.env.TARGET ?? "http://localhost:3001";
const DURATION = positiveNumber(process.env.DURATION ?? 10, "DURATION");
const THINK_TIME_S = positiveNumber(process.env.THINK_TIME_S ?? 10, "THINK_TIME_S");
const CONNECTION_STEPS = (process.env.CONNECTIONS ?? "100,500,1000")
  .split(",")
  .map((value) => positiveNumber(value.trim(), "CONNECTIONS", { integer: true }));

function nonNegativeNumber(value, name) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`${name} must be a non-negative number; received ${JSON.stringify(value)}`);
    process.exit(1);
  }
  return parsed;
}

// Throughput is hardware-dependent. Without an explicit service-level floor this remains
// an honest capacity report and still fails on response errors. CI or a deployment
// benchmark can opt into regression gates that match the machine it runs on.
const MIN_RPS_STATIC = nonNegativeNumber(process.env.MIN_RPS_STATIC, "MIN_RPS_STATIC");
const MIN_RPS_STREAMED = nonNegativeNumber(
  process.env.MIN_RPS_STREAMED,
  "MIN_RPS_STREAMED",
);

/**
 * Representative routes a real visit actually touches.
 *
 * The catalogue and a product page are what a shop's traffic overwhelmingly is; the filtered
 * catalogue is included because it is the case that used to be slowest, being a distinct URL
 * per filter combination.
 */
const ROUTES = [
  { name: "home", path: "/", minRps: MIN_RPS_STATIC },
  { name: "catalogue", path: "/phones", minRps: MIN_RPS_STREAMED },
  {
    name: "catalogue (filtered)",
    path: "/phones?price_max=50000&in_stock=1",
    minRps: MIN_RPS_STREAMED,
  },
  { name: "brand page", path: "/brands/samsung", minRps: MIN_RPS_STREAMED },
  { name: "product page", path: "/p/redmi-13c", minRps: MIN_RPS_STREAMED },
];

/** Targets. A run that misses one of these is reported as a failure, not a number. */
const TARGETS = {
  /** Any non-2xx under load is a failure to answer, which is the thing being tested. */
  maxErrors: 0,
};

function pad(value, width) {
  return String(value).padEnd(width);
}

async function measure(path, connections) {
  const result = await autocannon({
    url: `${TARGET}${path}`,
    connections,
    duration: DURATION,
    // A browser reuses connections; a load generator that opens a fresh socket per request
    // measures the kernel's accept queue instead of the application.
    pipelining: 1,
    headers: { "accept-encoding": "gzip" },
  });

  // Autocannon includes timeouts in errors; adding them again double-counts failures.
  const errors = result.non2xx + result.errors;
  return {
    rps: result.requests.average,
    p50: result.latency.p50,
    p97_5: result.latency.p97_5,
    p99: result.latency.p99,
    errors,
    bytesPerSec: result.throughput.average,
    completed: result.requests.total,
    non2xx: result.non2xx,
    socketErrors: result.errors,
    timeouts: result.timeouts,
  };
}

async function preflight() {
  let response;
  try {
    response = await fetch(`${TARGET}/phones`, { redirect: "manual" });
  } catch {
    console.error(`\nNothing is answering on ${TARGET}.\n`);
    console.error("Start the production server first:\n  pnpm build && pnpm start\n");
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`\n${TARGET}/phones answered ${response.status}. Fix that before measuring.\n`);
    process.exit(1);
  }

  // `next dev` never sets this. Measuring the dev server is the single most common way to
  // get a number that means nothing, so it is worth refusing rather than footnoting.
  if (!response.headers.get("x-nextjs-prerender")) {
    console.error(
      "\nThat server is not serving prerendered pages. This looks like `next dev`, or a\n" +
        "build where the static shell was lost. Either way the numbers would be meaningless.\n\n" +
        "  pnpm build && pnpm start\n",
    );
    process.exit(1);
  }
}

async function main() {
  await preflight();

  console.log(`\nTarget       ${TARGET}`);
  console.log(`Duration     ${DURATION}s per route per step`);
  console.log(`Think time   ${THINK_TIME_S}s (concurrent visitors = rps x think time)`);
  const throughputGate = MIN_RPS_STATIC > 0 || MIN_RPS_STREAMED > 0;
  console.log(
    throughputGate
      ? "Pass marks   configured per-route throughput floors, 0 errors\n"
      : "Pass marks   0 errors (throughput is report-only unless MIN_RPS_* is set)\n",
  );

  let failures = 0;
  const report = {
    createdAt: new Date().toISOString(), target: TARGET, durationSeconds: DURATION,
    thinkTimeSeconds: THINK_TIME_S, cpu: os.cpus()[0]?.model,
    logicalCpus: os.availableParallelism(), memoryBytes: os.totalmem(),
    note: "Estimated users are throughput times assumed think time, not tested simultaneous customers. This measures HTTP documents, not browser rendering or order submissions.",
    results: [],
  };
  const saveReport = () => {
    if (!process.env.REPORT_PATH) return;
    mkdirSync(dirname(process.env.REPORT_PATH), { recursive: true });
    writeFileSync(process.env.REPORT_PATH, JSON.stringify({ ...report, failures }, null, 2));
  };

  steps: for (const connections of CONNECTION_STEPS) {
    console.log(`\n=== ${connections} concurrent connections ===`);
    console.log(
      `${pad("route", 24)}${pad("rps", 10)}${pad("min", 8)}${pad("p50", 8)}${pad("p97.5", 8)}${pad("p99", 9)}${pad("errors", 8)}${pad("~users", 9)}verdict`,
    );

    for (const route of ROUTES) {
      const r = await measure(route.path, connections);
      const users = Math.round(r.rps * THINK_TIME_S);
      // Latency is reported, but it is not a pass gate in a saturation test: at hundreds
      // of continuously active connections, queueing latency necessarily grows. The user
      // capacity figure already models real think time from sustained throughput.
      const ok = r.completed > 0 && r.rps >= route.minRps && r.errors <= TARGETS.maxErrors;
      if (!ok) failures += 1;
      report.results.push({ route: route.path, connections, ...r, estimatedUsers: users, passed: ok });
      saveReport();

      console.log(
        pad(route.name, 24) +
          pad(Math.round(r.rps), 10) +
          pad(route.minRps > 0 ? route.minRps : "-", 8) +
          pad(`${r.p50}ms`, 8) +
          pad(`${r.p97_5}ms`, 8) +
          pad(`${r.p99}ms`, 9) +
          pad(r.errors, 8) +
          pad(users.toLocaleString(), 9) +
          (ok ? "pass" : "FAIL"),
      );
      if (!ok && process.env.STOP_ON_FAILURE !== "false") {
        console.error("Stopping at the first failed load step so queued work can drain. Set STOP_ON_FAILURE=false to continue a saturation experiment.");
        break steps;
      }
    }
  }

  console.log(
    "\nBackend check: compare the Medusa request count before and after this run. If it rose\n" +
      "in step with the load, the cache is not doing the work and the numbers will not hold\n" +
      "on a smaller machine.\n",
  );

  saveReport();
  if (failures > 0) {
    console.error(`${failures} route/step combination(s) missed the pass mark.\n`);
    process.exit(1);
  }
  console.log("All routes met the pass mark.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
