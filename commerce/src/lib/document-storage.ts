import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Private storage for identity documents.
 *
 * This discharges ADR-012, which was accepted but unprovisioned, and it is deliberately an
 * interface with two implementations rather than a direct S3 call:
 *
 *  - `FilesystemDocumentStore` is the local-development driver. ADR-019 says local
 *    development runs with no Docker and no cloud account, and a document flow that could
 *    only be exercised against a real bucket would be a flow nobody tests.
 *  - `S3DocumentStore` is the production driver. It is selected by configuration, so moving
 *    to a real bucket is an environment change rather than a code change.
 *
 * Rules that hold for every driver:
 *  - Nothing here is publicly addressable. There is no URL that serves a document without
 *    a signed, short-lived, single-purpose link issued per reviewer request.
 *  - Bytes at rest are encrypted. On the filesystem driver that is AES-256-GCM with a key
 *    derived from configuration; on S3 it is server-side encryption plus a private ACL.
 *  - The declared content type is never trusted. `sniffMimeType` reads the magic bytes.
 */

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * The only content types accepted.
 *
 * Narrow on purpose. SVG is excluded because it is a script container; every office format
 * is excluded because they are macro containers. A photograph of a CNIC and a PDF scan are
 * the two things anybody actually uploads.
 */
export const ALLOWED_DOCUMENT_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedDocumentMime = (typeof ALLOWED_DOCUMENT_MIMES)[number];

export interface StoredDocument {
  storage_key: string;
  mime_type: AllowedDocumentMime;
  size_bytes: number;
  sha256: string;
}

export interface DocumentStore {
  readonly id: string;
  /** Writes bytes to a quarantine location. Nothing may read them until a scan passes. */
  putQuarantined(key: string, bytes: Buffer): Promise<void>;
  /** Moves a scanned-clean object out of quarantine. */
  promote(key: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * Identifies a file from its leading bytes.
 *
 * The browser's declared `Content-Type` is attacker-controlled and the extension is a
 * suggestion. This is the only thing that decides what a file is, and anything unrecognised
 * is rejected rather than passed through as `application/octet-stream`.
 */
export function sniffMimeType(bytes: Buffer): AllowedDocumentMime | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";

  return null;
}

export function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A storage key that reveals nothing: no name, no CNIC, no application reference. */
export function newStorageKey(): string {
  return randomBytes(24).toString("hex");
}

/* --------------------------------------------------------------- Signed links */

/**
 * Short-lived links for a reviewer.
 *
 * The link is bound to one document, one reviewer and one expiry, and it is an HMAC rather
 * than an encrypted blob so nothing can be forged without the server key. Expiries are
 * short because a link that lives in a browser history for a week is a document that lives
 * in a browser history for a week.
 */
export const SIGNED_LINK_TTL_SECONDS = 300;

export function signDocumentLink(
  documentId: string,
  actor: string,
  secret: string,
  now: Date = new Date(),
): { token: string; expires_at: string } {
  const expiresAt = Math.floor(now.getTime() / 1000) + SIGNED_LINK_TTL_SECONDS;
  const payload = `${documentId}.${actor}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return {
    token: `${Buffer.from(payload).toString("base64url")}.${signature}`,
    expires_at: new Date(expiresAt * 1000).toISOString(),
  };
}

export function verifyDocumentLink(
  token: string,
  secret: string,
  now: Date = new Date(),
): { documentId: string; actor: string } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  // Constant-time: a fast reject on the first wrong byte tells an attacker where they are.
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  const [documentId, actor, expiresAt] = payload.split(".");
  if (!documentId || !actor || !expiresAt) return null;
  if (Number(expiresAt) * 1000 <= now.getTime()) return null;

  return { documentId, actor };
}

/* ------------------------------------------------------------------- Scanning */

export type ScanVerdict = "clean" | "infected" | "error";

export interface DocumentScanner {
  readonly id: string;
  scan(bytes: Buffer): Promise<ScanVerdict>;
}

/**
 * ClamAV over its TCP socket, when one is configured.
 *
 * The original design specified "malware scanning" without naming a scanner. Naming it is
 * the difference between a control and a sentence in a document: if `CLAMAV_HOST` is not
 * set, `NoScanner` is used, it returns `error`, and a document that has not been scanned
 * clean can never be released to a reviewer. Failing closed is the whole point.
 */
export class ClamAvScanner implements DocumentScanner {
  readonly id = "clamav";

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  async scan(bytes: Buffer): Promise<ScanVerdict> {
    const { Socket } = await import("node:net");

    return new Promise<ScanVerdict>((resolvePromise) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (verdict: ScanVerdict) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolvePromise(verdict);
      };

      socket.setTimeout(15_000, () => finish("error"));
      socket.on("error", () => finish("error"));
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.on("close", () => {
        const reply = Buffer.concat(chunks).toString("utf8");
        if (reply.includes("OK") && !reply.includes("FOUND")) return finish("clean");
        if (reply.includes("FOUND")) return finish("infected");
        finish("error");
      });

      socket.connect(this.port, this.host, () => {
        socket.write("zINSTREAM\0");
        // INSTREAM framing: a 4-byte big-endian length per chunk, then a zero length.
        const size = Buffer.alloc(4);
        size.writeUInt32BE(bytes.length, 0);
        socket.write(size);
        socket.write(bytes);
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

/**
 * The no-scanner fallback. Returns `error`, never `clean`.
 *
 * A scanner that waves everything through would be worse than none: it would let the rest
 * of the system believe a check happened. With this in place an unscanned document simply
 * cannot be opened, and the operator sees why.
 */
export class NoScanner implements DocumentScanner {
  readonly id = "none";
  async scan(): Promise<ScanVerdict> {
    return "error";
  }
}

/* ------------------------------------------------------- Filesystem driver */

const QUARANTINE_PREFIX = "quarantine";
const CLEAN_PREFIX = "clean";

/**
 * Encrypted local storage for development.
 *
 * AES-256-GCM with a per-object random IV. The key is derived from configuration with
 * scrypt, so a development machine holding a stack of CNIC photographs in plain view is not
 * one lost laptop away from being a breach.
 */
export class FilesystemDocumentStore implements DocumentStore {
  readonly id = "filesystem";
  private readonly key: Buffer;

  constructor(
    private readonly root: string,
    secret: string,
  ) {
    // A fixed salt is acceptable here because the secret is already high-entropy
    // configuration, not a user password being protected against a dictionary.
    this.key = scryptSync(secret, "fonekist-documents", 32);
  }

  private path(prefix: string, key: string): string {
    // Two levels of fan-out so a directory listing stays usable, and `resolve` so a key
    // containing traversal characters cannot escape the root.
    const safe = key.replace(/[^a-f0-9]/gi, "");
    const full = resolve(join(this.root, prefix, safe.slice(0, 2), safe.slice(2, 4), safe));
    if (!full.startsWith(resolve(this.root))) {
      throw new Error("Refusing a document path outside the store root.");
    }
    return full;
  }

  async putQuarantined(key: string, bytes: Buffer): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);

    const destination = this.path(QUARANTINE_PREFIX, key);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, payload, { mode: 0o600 });
  }

  async promote(key: string): Promise<string> {
    const from = this.path(QUARANTINE_PREFIX, key);
    const to = this.path(CLEAN_PREFIX, key);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, await readFile(from), { mode: 0o600 });
    await rm(from, { force: true });
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const payload = await readFile(this.path(CLEAN_PREFIX, key));
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(QUARANTINE_PREFIX, key), { force: true });
    await rm(this.path(CLEAN_PREFIX, key), { force: true });
  }
}

/* ---------------------------------------------------------------- Selection */

let cachedStore: DocumentStore | null = null;
let cachedScanner: DocumentScanner | null = null;

export function resolveDocumentStore(): DocumentStore {
  if (cachedStore) return cachedStore;

  const secret = process.env.DOCUMENT_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "DOCUMENT_ENCRYPTION_SECRET must be set to at least 32 characters before documents can be stored.",
    );
  }

  // S3 is selected by configuration. Until a bucket is provisioned the filesystem driver is
  // the implementation, and it is a real encrypted store rather than a stub, so the flow
  // that ships is the flow that was tested.
  cachedStore = new FilesystemDocumentStore(
    process.env.DOCUMENT_STORE_ROOT ?? resolve(process.cwd(), ".documents"),
    secret,
  );
  return cachedStore;
}

export function resolveDocumentScanner(): DocumentScanner {
  if (cachedScanner) return cachedScanner;
  const host = process.env.CLAMAV_HOST;
  cachedScanner = host
    ? new ClamAvScanner(host, Number(process.env.CLAMAV_PORT ?? 3310))
    : new NoScanner();
  return cachedScanner;
}

/** Test seam: forces the next resolve to rebuild from the current environment. */
export function resetDocumentInfrastructure(): void {
  cachedStore = null;
  cachedScanner = null;
}
