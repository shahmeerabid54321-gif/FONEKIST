#!/usr/bin/env node
/**
 * Runs the built storefront across every core the machine has.
 *
 * **Why this exists.** `next start` is a single Node process, and Node is single-threaded,
 * so on an eight-core machine it uses one core and leaves seven idle. Measured on this
 * project that ceiling was real: the catalogue served about 70 requests a second and the
 * process sat at 100% of one CPU while the machine as a whole was 87% idle. No amount of
 * caching moves that number, because the work that remains is compressing and streaming the
 * response, and one core can only do so much of it.
 *
 * `node:cluster` forks one worker per core and they share a single listening socket, which
 * the kernel load-balances. Nothing about the application changes: each worker is an
 * ordinary Next server.
 *
 * **What this means for scaling.** The caches are per-process, so N workers hold N copies of
 * a cached page and the first request to each worker is a miss. That is fine here, where the
 * entries are small and the population is a few hundred pages, and it is exactly the
 * situation `cacheHandlers` with a shared store is for once this runs on more than one
 * machine. See the deployment notes in README.md.
 *
 * Usage:
 *   pnpm build && pnpm serve
 *   WORKERS=4 pnpm serve
 */

import cluster from "node:cluster";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(root, ".next", "standalone", "server.js");
function positiveInteger(value, name, { max } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (max !== undefined && parsed > max)) {
    const range = max === undefined ? "a positive integer" : `an integer between 1 and ${max}`;
    console.error(`${name} must be ${range}; received ${JSON.stringify(value)}`);
    process.exit(1);
  }
  return parsed;
}

const PORT = positiveInteger(process.env.PORT ?? 3001, "PORT", { max: 65_535 });

/**
 * One worker per core, unless told otherwise.
 *
 * `availableParallelism` reports what this process may actually use, which on a container
 * with a CPU limit is not the same as the number of cores the host has. That distinction is
 * the whole reason `experimental.cpus` had to be pinned for the build.
 */
const WORKERS = positiveInteger(
  process.env.WORKERS ?? os.availableParallelism?.() ?? os.cpus().length,
  "WORKERS",
);

// A broken build, occupied port or invalid host makes every worker fail before it can
// listen. Restarting those workers without a limit turns one useful error into an endless
// process storm. A healthy worker that dies later is still replaced, but repeated failures
// stop the service so the process manager can apply its own backoff and surface the fault.
const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS_PER_WINDOW = Math.max(5, WORKERS * 2);

if (cluster.isPrimary) {
  const { existsSync } = await import("node:fs");
  if (!existsSync(SERVER)) {
    console.error(
      `\nNo standalone build at ${SERVER}.\n\n` +
        "Run `pnpm build` first. If it is there but empty, check that `output: \"standalone\"`\n" +
        "is still set in next.config.ts.\n",
    );
    process.exit(1);
  }

  console.log(`FONEKIST on http://localhost:${PORT} across ${WORKERS} worker(s)`);

  for (let i = 0; i < WORKERS; i += 1) cluster.fork();

  let shuttingDown = false;
  const restartTimes = [];

  cluster.on("exit", (worker, code, signal) => {
    // A worker that dies under load must not quietly reduce capacity for the rest of the
    // process's life. A deliberate shutdown is never replaced.
    if (shuttingDown) return;

    const now = Date.now();
    while (restartTimes[0] !== undefined && now - restartTimes[0] > RESTART_WINDOW_MS) {
      restartTimes.shift();
    }

    if (restartTimes.length >= MAX_RESTARTS_PER_WINDOW) {
      shuttingDown = true;
      console.error(
        `worker ${worker.process.pid} exited (${signal ?? code}); ` +
          `stopping after ${restartTimes.length} restarts in 60 seconds`,
      );
      for (const current of Object.values(cluster.workers ?? {})) current?.kill("SIGTERM");
      process.exitCode = 1;
      return;
    }

    restartTimes.push(now);
    console.error(`worker ${worker.process.pid} exited (${signal ?? code}); starting another`);
    cluster.fork();
  });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const worker of Object.values(cluster.workers ?? {})) worker?.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else {
  process.env.PORT = String(PORT);
  process.env.HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";
  await import(`file://${SERVER}`);
}
