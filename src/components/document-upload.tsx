"use client";

import { useId, useState } from "react";
import { InlineAlert } from "./ui";

/**
 * One identity document.
 *
 * Uploaded as soon as it is chosen rather than carried in the form submission, for two
 * reasons: an 8 MB photograph in a form post is a request that times out on a mobile
 * connection, and uploading early means the malware scan has already run by the time the
 * application is submitted.
 *
 * The component reports the scan verdict honestly. `error` means no scanner was available,
 * and it says so rather than showing a tick, because a reviewer will not be able to open
 * the file and the applicant should not discover that days later.
 *
 * The `accept` attribute is a convenience for the file picker, not a control. Commerce
 * sniffs the magic bytes and ignores both the extension and the declared type.
 */

export interface UploadedDocument {
  kind: string;
  documentId: string;
  scanStatus: string;
  fileName: string;
}

export function DocumentUpload({
  kind,
  label,
  hint,
  uploadToken,
  onUploaded,
}: {
  kind: string;
  label: string;
  hint?: string;
  uploadToken: string;
  onUploaded: (document: UploadedDocument) => void;
}) {
  const id = useId();
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = async (file: File) => {
    setState("uploading");
    setMessage(null);

    try {
      const response = await fetch(
        `/api/installment-documents?kind=${encodeURIComponent(kind)}&upload_token=${encodeURIComponent(uploadToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: file,
        },
      );

      const body = (await response.json()) as {
        document_id?: string;
        scan_status?: string;
        error?: { message?: string };
      };

      if (!response.ok || !body.document_id) {
        setState("error");
        setMessage(body.error?.message ?? "That file could not be uploaded.");
        return;
      }

      setState("done");
      setFileName(file.name);
      onUploaded({
        kind,
        documentId: body.document_id,
        scanStatus: body.scan_status ?? "pending",
        fileName: file.name,
      });

      if (body.scan_status !== "clean") {
        // Said out loud rather than hidden behind a tick. A document that has not been
        // scanned clean cannot be opened by a reviewer, so the applicant needs to know now.
        setMessage(
          "Uploaded, but our security scan has not confirmed it yet. We may ask you for this again.",
        );
      }
    } catch {
      setState("error");
      setMessage("That file could not be uploaded. Check your connection and try again.");
    }
  };

  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--line)] p-4">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text)]">
        {label}
      </label>
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}

      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        disabled={state === "uploading"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
        className="mt-3 block w-full text-sm text-[var(--text-soft)] file:mr-3 file:min-h-[44px] file:rounded-[var(--radius-control)] file:border file:border-[var(--line-strong)] file:bg-[var(--surface-raised)] file:px-4 file:text-sm file:font-medium file:text-[var(--text)]"
      />

      <p className="mt-2 text-sm" aria-live="polite">
        {state === "uploading" && <span className="text-[var(--text-soft)]">Uploading</span>}
        {state === "done" && (
          <span className="text-[var(--color-emerald-strong)]">Uploaded {fileName}</span>
        )}
      </p>

      {message && (
        <div className="mt-2">
          <InlineAlert tone={state === "error" ? "danger" : "warning"}>{message}</InlineAlert>
        </div>
      )}
    </div>
  );
}
