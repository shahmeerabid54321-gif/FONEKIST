import { createHash } from "node:crypto";
import { MedusaService } from "@medusajs/framework/utils";
import { AppError, type IdempotentOperation } from "@pk/contracts";
import { IdempotencyRecord } from "./models";

/** How long an in-progress record blocks a concurrent attempt before it is considered stale. */
const LOCK_TTL_MS = 60_000;

export interface ExecuteOptions<T> {
  key: string;
  operation: IdempotentOperation;
  /** Payload used to detect key reuse with a different request. */
  request?: unknown;
  /** The work to perform exactly once. */
  run: () => Promise<{ result: T; reference?: string }>;
}

export function hashRequest(request: unknown): string {
  return createHash("sha256").update(JSON.stringify(request ?? null)).digest("hex");
}

/**
 * Idempotency service.
 *
 * `execute` is the single entry point for every duplicate-risk write. It guarantees:
 *   - the work runs at most once per (key, operation);
 *   - a retry returns the same semantic result rather than repeating the side effect;
 *   - the same key with a different payload is rejected instead of silently accepted;
 *   - a crashed attempt does not block the key forever.
 */
class IdempotencyService extends MedusaService({ IdempotencyRecord }) {
  async execute<T>(options: ExecuteOptions<T>): Promise<{ result: T; replayed: boolean }> {
    const requestHash = options.request === undefined ? null : hashRequest(options.request);

    const existing = await this.findRecord(options.key, options.operation);

    if (existing) {
      // Key reuse with a different payload is a client bug, not a retry.
      if (requestHash && existing.request_hash && existing.request_hash !== requestHash) {
        throw new AppError("CONFLICT", {
          message: "This request was already submitted with different details.",
          internal: { key: options.key, operation: options.operation },
        });
      }

      if (existing.status === "succeeded") {
        return { result: existing.result_payload as T, replayed: true };
      }

      if (existing.status === "in_progress") {
        const lockedUntil = existing.locked_until ? new Date(existing.locked_until) : null;
        // Still held by a live attempt: tell the caller to wait rather than duplicating work.
        if (lockedUntil && lockedUntil.getTime() > Date.now()) {
          throw new AppError("CONFLICT", {
            message: "This request is already being processed. Please wait a moment.",
            internal: { key: options.key, operation: options.operation },
          });
        }
        // Stale lock from a crashed attempt: reclaim it.
        await this.updateIdempotencyRecords({
          id: existing.id,
          status: "in_progress",
          locked_until: new Date(Date.now() + LOCK_TTL_MS),
        });
      } else {
        // Previous attempt failed. Allow a fresh attempt under the same key.
        await this.updateIdempotencyRecords({
          id: existing.id,
          status: "in_progress",
          error_code: null,
          locked_until: new Date(Date.now() + LOCK_TTL_MS),
        });
      }

      return { result: await this.runAndRecord(existing.id, options), replayed: false };
    }

    let created: { id: string };
    try {
      created = (await this.createIdempotencyRecords({
        idempotency_key: options.key,
        operation: options.operation,
        request_hash: requestHash,
        status: "in_progress",
        locked_until: new Date(Date.now() + LOCK_TTL_MS),
      })) as unknown as { id: string };
    } catch (error) {
      // Lost a race on the unique index: another request created the record first.
      const raced = await this.findRecord(options.key, options.operation);
      if (!raced) throw error;
      throw new AppError("CONFLICT", {
        message: "This request is already being processed. Please wait a moment.",
        internal: { key: options.key, operation: options.operation },
      });
    }

    return { result: await this.runAndRecord(created.id, options), replayed: false };
  }

  private async runAndRecord<T>(recordId: string, options: ExecuteOptions<T>): Promise<T> {
    try {
      const { result, reference } = await options.run();
      await this.updateIdempotencyRecords({
        id: recordId,
        status: "succeeded",
        result_reference: reference ?? null,
        result_payload: result as Record<string, unknown>,
        locked_until: null,
      });
      return result;
    } catch (error) {
      const appError = AppError.from(error);
      await this.updateIdempotencyRecords({
        id: recordId,
        // An indeterminate outcome (timeout, provider unavailable) is NOT recorded as
        // failed — API contract section 13: a timeout means unknown, and marking it failed
        // would let a retry duplicate a payment that may in fact have succeeded.
        status: appError.isIndeterminate ? "in_progress" : "failed",
        error_code: appError.code,
        locked_until: appError.isIndeterminate ? new Date(Date.now() + LOCK_TTL_MS) : null,
      });
      throw appError;
    }
  }

  private async findRecord(key: string, operation: string) {
    const records = (await this.listIdempotencyRecords({
      idempotency_key: key,
      operation,
    })) as unknown as {
      id: string;
      status: "in_progress" | "succeeded" | "failed";
      request_hash: string | null;
      result_payload: unknown;
      locked_until: Date | string | null;
    }[];
    return records[0] ?? null;
  }

  /**
   * Webhook deduplication (API contract section 7 step 5). Returns true the first time an
   * event id is seen and false for every replay, so the caller can acknowledge a duplicate
   * without re-applying it.
   */
  async claimWebhookEvent(provider: string, eventId: string): Promise<boolean> {
    try {
      await this.createIdempotencyRecords({
        idempotency_key: `${provider}:${eventId}`,
        operation: "payment.webhook",
        request_hash: null,
        status: "succeeded",
        result_reference: eventId,
        locked_until: null,
      });
      return true;
    } catch {
      // Unique constraint hit: this event has already been processed.
      return false;
    }
  }
}

export default IdempotencyService;
