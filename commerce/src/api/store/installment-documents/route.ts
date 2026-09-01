import { randomBytes } from "node:crypto";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { INSTALLMENT_DOCUMENT_KINDS, type InstallmentDocumentKind } from "@pk/contracts";
import { INSTALLMENTS_MODULE } from "../../../modules/installments";
import type InstallmentsService from "../../../modules/installments/service";
import {
  MAX_DOCUMENT_BYTES,
  newStorageKey,
  resolveDocumentScanner,
  resolveDocumentStore,
  sha256Of,
  sniffMimeType,
} from "../../../lib/document-storage";
import { clientIpOf, fail, ok, requestIdOf } from "../../../lib/http";
import { rateLimit } from "../../../lib/rate-limit";

/**
 * POST /store/installment-documents
 *
 * Uploads one identity document. The bytes are sent raw as the request body, with the
 * document kind and an upload token in the query string, so nothing has to be base64
 * inflated through a JSON body parser.
 *
 * The order of operations is the security property:
 *   1. cap the size while reading, so an oversized upload is refused before it is buffered;
 *   2. sniff the real type from the magic bytes, never the declared Content-Type;
 *   3. write to a quarantine location;
 *   4. scan, and only promote out of quarantine on a clean verdict.
 *
 * A document that has not been scanned clean can never be released to a reviewer. With no
 * scanner configured the verdict is `error`, not `clean` — the flow fails closed rather
 * than pretending a check happened (SEC-005).
 *
 * The response carries an opaque document id. The filename the browser sent is discarded:
 * it is attacker-controlled and frequently the customer's own name.
 */

const UPLOAD_LIMIT = 12;
const WINDOW_SECONDS = 15 * 60;

/**
 * Reads the request body with a hard ceiling.
 *
 * Reading the whole stream and then checking its length would mean an attacker decides how
 * much memory this process allocates, so the check happens per chunk and the connection is
 * destroyed the moment the limit is passed.
 */
async function readCappedBody(req: MedusaRequest, limit: number): Promise<Buffer | "too_large"> {
  // A body parser may already have consumed the stream for a known content type.
  if (Buffer.isBuffer(req.body)) {
    return req.body.length > limit ? "too_large" : req.body;
  }

  return new Promise<Buffer | "too_large">((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        settled = true;
        req.destroy();
        resolvePromise("too_large");
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        resolvePromise(Buffer.concat(chunks));
      }
    });
    req.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  const limit = rateLimit(`installment-docs:${clientIpOf(req)}`, UPLOAD_LIMIT, WINDOW_SECONDS);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfterSeconds));
    res.status(429).json(
      fail({ code: "RATE_LIMITED", message: "Too many uploads. Please wait a few minutes." }, requestId),
    );
    return;
  }

  try {
    const kind = String(req.query.kind ?? "") as InstallmentDocumentKind;
    if (!INSTALLMENT_DOCUMENT_KINDS.includes(kind)) {
      res.status(400).json(
        fail({ code: "VALIDATION_ERROR", message: "Say which document this is." }, requestId),
      );
      return;
    }

    // Ties uploads made before an application exists to the browser session that made them.
    // Generated server-side when absent so a client cannot choose a token that collides
    // with somebody else's.
    const uploadToken = String(req.query.upload_token ?? "").trim() || randomBytes(16).toString("hex");
    if (!/^[a-f0-9]{16,64}$/.test(uploadToken)) {
      res.status(400).json(
        fail({ code: "VALIDATION_ERROR", message: "That upload session is not valid." }, requestId),
      );
      return;
    }

    const bytes = await readCappedBody(req, MAX_DOCUMENT_BYTES);
    if (bytes === "too_large") {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: `That file is too large. The limit is ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`,
          },
          requestId,
        ),
      );
      return;
    }

    if (bytes.length === 0) {
      res.status(400).json(fail({ code: "VALIDATION_ERROR", message: "That file is empty." }, requestId));
      return;
    }

    // The magic bytes, never the declared type or the extension. Both of those are chosen
    // by whoever is uploading.
    const mime = sniffMimeType(bytes);
    if (!mime) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "Upload a photo (JPEG, PNG or WebP) or a PDF scan.",
          },
          requestId,
        ),
      );
      return;
    }

    const store = resolveDocumentStore();
    const scanner = resolveDocumentScanner();
    const installments: InstallmentsService = req.scope.resolve(INSTALLMENTS_MODULE);

    const storageKey = newStorageKey();
    await store.putQuarantined(storageKey, bytes);

    const verdict = await scanner.scan(bytes);
    if (verdict === "clean") await store.promote(storageKey);

    const created = (await installments.createInstallmentDocuments({
      upload_token: uploadToken,
      kind,
      storage_key: storageKey,
      mime_type: mime,
      size_bytes: bytes.length,
      sha256: sha256Of(bytes),
      scan_status: verdict,
      scanned_at: new Date(),
      scanner: scanner.id,
    } as never)) as unknown as { id: string } | { id: string }[];

    const document = Array.isArray(created) ? created[0]! : created;

    if (verdict === "infected") {
      await store.delete(storageKey);
      logger.warn(`[installments] rejected an infected upload (${document.id})`);
      res.status(400).json(
        fail(
          { code: "VALIDATION_ERROR", message: "That file did not pass our security check." },
          requestId,
        ),
      );
      return;
    }

    res.status(201).json(
      ok(
        {
          document_id: document.id,
          upload_token: uploadToken,
          kind,
          // Reported honestly. `error` means no scanner was available, and a reviewer will
          // not be able to open it until one is; saying so here is better than a silent
          // failure at review time.
          scan_status: verdict,
          size_bytes: bytes.length,
        },
        requestId,
      ),
    );
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
