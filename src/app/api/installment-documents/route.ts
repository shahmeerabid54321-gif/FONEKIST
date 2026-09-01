import { NextResponse } from "next/server";
import { AppError } from "@/lib/pk";
import { medusaFetch } from "@/lib/medusa";
import { log } from "@/lib/log";

/**
 * POST /api/installment-documents?kind=...&upload_token=...
 *
 * A same-origin proxy for an identity document upload.
 *
 * It exists so the browser never learns the commerce URL and never holds the publishable
 * key while carrying a CNIC photograph. Nothing is parsed, inspected or stored here: the
 * bytes are forwarded and commerce decides what the file actually is by sniffing it, scans
 * it, and quarantines it until the scan passes (SEC-005).
 *
 * Nothing about the file is logged. Not the size, not the type, and certainly not the
 * bytes: a log line is the least controlled copy of anything it touches, and this route
 * only ever handles identity documents (ADR-024).
 */

/** Matches the server's ceiling, so an oversized upload is refused before it crosses. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const uploadToken = url.searchParams.get("upload_token") ?? "";

  if (!kind) {
    return NextResponse.json(
      { error: { message: "Say which document this is." } },
      { status: 400 },
    );
  }

  const body = Buffer.from(await request.arrayBuffer());

  if (body.length === 0) {
    return NextResponse.json({ error: { message: "That file is empty." } }, { status: 400 });
  }

  if (body.length > MAX_BYTES) {
    return NextResponse.json(
      { error: { message: `That file is too large. The limit is ${MAX_BYTES / (1024 * 1024)} MB.` } },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ kind });
  if (uploadToken) query.set("upload_token", uploadToken);

  try {
    const result = await medusaFetch<{
      data: { document_id: string; upload_token: string; kind: string; scan_status: string };
    }>(`/store/installment-documents?${query.toString()}`, {
      method: "POST",
      // Forwarded raw. Base64 through a JSON body would inflate an 8 MB photograph past
      // every default body limit between here and the database.
      headers: { "content-type": "application/octet-stream" },
      body: body as unknown as BodyInit,
      cache: "no-store",
      // An 8 MB upload over a Pakistani mobile connection is not an 8 second request.
      timeoutMs: 60_000,
    });

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    const appError = AppError.from(error);
    // The operation and the code, and nothing else. No filename, no size, no token.
    log.warn("Document upload failed", { operation: "installments.upload" }, appError);
    return NextResponse.json({ error: { message: appError.message } }, { status: 400 });
  }
}
