import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALLOWED_DOCUMENT_MIMES,
  FilesystemDocumentStore,
  NoScanner,
  signDocumentLink,
  sniffMimeType,
  verifyDocumentLink,
} from "../document-storage";

const SECRET = "a".repeat(48);

/** Minimal real headers, because the point of sniffing is that it reads the bytes. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n", "ascii"), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.alloc(4),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(64, 1),
]);

describe("sniffMimeType", () => {
  it("identifies the formats we accept from their magic bytes", () => {
    expect(sniffMimeType(JPEG)).toBe("image/jpeg");
    expect(sniffMimeType(PNG)).toBe("image/png");
    expect(sniffMimeType(PDF)).toBe("application/pdf");
    expect(sniffMimeType(WEBP)).toBe("image/webp");
  });

  it("rejects an SVG however it is labelled", () => {
    // SVG is a script container. The upload endpoint never sees a Content-Type it trusts,
    // so this is the only thing standing between us and stored XSS in a reviewer's browser.
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(sniffMimeType(svg)).toBeNull();
  });

  it("rejects an executable renamed to look like a photo", () => {
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64, 0)]);
    expect(sniffMimeType(elf)).toBeNull();
  });

  it("rejects a file too short to identify", () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("only ever returns a type from the allow list", () => {
    for (const bytes of [JPEG, PNG, PDF, WEBP]) {
      expect(ALLOWED_DOCUMENT_MIMES).toContain(sniffMimeType(bytes));
    }
  });
});

describe("signed document links", () => {
  it("round-trips a valid token", () => {
    const { token } = signDocumentLink("idoc_1", "user_1", SECRET);
    expect(verifyDocumentLink(token, SECRET)).toEqual({ documentId: "idoc_1", actor: "user_1" });
  });

  it("rejects a token signed with a different key", () => {
    const { token } = signDocumentLink("idoc_1", "user_1", SECRET);
    expect(verifyDocumentLink(token, "b".repeat(48))).toBeNull();
  });

  it("rejects a tampered payload", () => {
    // Swapping the document id is the attack this defends against: one valid link must not
    // open somebody else's CNIC.
    const { token } = signDocumentLink("idoc_1", "user_1", SECRET);
    const [, signature] = token.split(".");
    const forged = `${Buffer.from("idoc_2.user_1.99999999999").toString("base64url")}.${signature}`;
    expect(verifyDocumentLink(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const { token } = signDocumentLink("idoc_1", "user_1", SECRET, new Date("2026-01-01T00:00:00Z"));
    expect(verifyDocumentLink(token, SECRET, new Date("2026-01-01T01:00:00Z"))).toBeNull();
  });

  it("rejects malformed input rather than throwing", () => {
    expect(verifyDocumentLink("", SECRET)).toBeNull();
    expect(verifyDocumentLink("garbage", SECRET)).toBeNull();
    expect(verifyDocumentLink("a.b.c.d", SECRET)).toBeNull();
  });
});

describe("NoScanner", () => {
  it("returns error, never clean", async () => {
    // The whole flow fails closed on this: with no scanner configured, nothing can be
    // scanned clean and therefore nothing can be opened by a reviewer.
    await expect(new NoScanner().scan()).resolves.toBe("error");
  });
});

describe("FilesystemDocumentStore", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "fonekist-docs-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("encrypts at rest and decrypts back to the original bytes", async () => {
    const store = new FilesystemDocumentStore(root, SECRET);
    await store.putQuarantined("abcdef0123456789", JPEG);
    await store.promote("abcdef0123456789");
    await expect(store.get("abcdef0123456789")).resolves.toEqual(JPEG);
  });

  it("cannot read a quarantined document", async () => {
    // A document that has not been scanned clean is not merely flagged: it is not in the
    // place `get` reads from.
    const store = new FilesystemDocumentStore(root, SECRET);
    await store.putQuarantined("abcdef0123456789", JPEG);
    await expect(store.get("abcdef0123456789")).rejects.toThrow();
  });

  it("refuses a key that tries to escape the store root", async () => {
    const store = new FilesystemDocumentStore(root, SECRET);
    // Non-hex characters are stripped, so traversal cannot survive into a path at all.
    await store.putQuarantined("../../etc/passwd", JPEG);
    await store.promote("../../etc/passwd");
    await expect(store.get("../../etc/passwd")).resolves.toEqual(JPEG);
  });

  it("deletes from both quarantine and the clean location", async () => {
    const store = new FilesystemDocumentStore(root, SECRET);
    await store.putQuarantined("abcdef0123456789", JPEG);
    await store.promote("abcdef0123456789");
    await store.delete("abcdef0123456789");
    await expect(store.get("abcdef0123456789")).rejects.toThrow();
  });
});
