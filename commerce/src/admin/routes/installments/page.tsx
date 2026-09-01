import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Table, Text, Textarea, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Installment review queue (ADR-013: extend Medusa Admin, do not rewrite it).
 *
 * Three properties of this screen are deliberate rather than incidental:
 *
 *  - **CNIC numbers are masked here and stay masked.** The full value is one explicit
 *    click away in the detail panel, and that click is audited server-side. A queue that
 *    showed them would put a hundred CNICs on screen for every glance at the workload
 *    (ADR-024).
 *  - **A decision requires a note.** The button is disabled without one. An unexplained
 *    rejection cannot be reviewed by a supervisor or explained to the person it was about.
 *  - **Every decision carries an idempotency key.** A double-clicked approval would
 *    otherwise send two messages and write two audit trails for one act (INST-008).
 */

interface Plan {
  label: string;
  cash_price_pkr: number;
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  monthly_total_pkr: number;
  total_payable_pkr: number;
  difference_pkr: number;
  difference_percent: number;
}

interface DocumentRow {
  id: string;
  kind: string;
  mime_type: string;
  size_bytes: number;
  scan_status: string;
  openable: boolean;
  deleted: boolean;
}

interface AuditRow {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  created_at: string;
}

interface Application {
  id: string;
  reference: string;
  state: string;
  state_label: string;
  order_id: string | null;
  plan: Plan;
  applicant: {
    name: string;
    cnic_masked: string | null;
    cnic?: string | null;
    phone: string;
    email: string;
    employment_type: string;
    monthly_income_pkr: number;
    employer_name?: string | null;
    address?: Record<string, unknown> | null;
  };
  guarantor: {
    name: string;
    cnic_masked: string | null;
    cnic?: string | null;
    phone: string;
    relationship: string;
  };
  reserved_until: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  documents?: DocumentRow[];
  audit?: AuditRow[];
  purge_after?: string | null;
}

const OPEN_STATES = ["submitted", "under_review", "more_information_required"];

const rupees = (amount: number): string => `Rs ${amount.toLocaleString("en-PK")}`;

const DOCUMENT_LABEL: Record<string, string> = {
  cnic_front: "CNIC front",
  cnic_back: "CNIC back",
  guarantor_cnic_front: "Guarantor CNIC front",
  guarantor_cnic_back: "Guarantor CNIC back",
  proof_of_income: "Proof of income",
};

function stateColour(state: string): "green" | "red" | "orange" | "grey" {
  if (state === "approved" || state === "handed_off") return "green";
  if (state === "rejected") return "red";
  if (OPEN_STATES.includes(state)) return "orange";
  return "grey";
}

const InstallmentsPage = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/admin/installments?limit=100", { credentials: "include" });
      const body = await response.json();
      setApplications(body?.data?.applications ?? []);
    } catch {
      toast.error("Could not load the review queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Opens one application. `disclose=cnic` is passed explicitly, and the server records the
   * disclosure before answering: the reviewer is choosing to look, and there is a record
   * of it.
   */
  const open = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/admin/installments/${id}?disclose=cnic`, {
        credentials: "include",
      });
      const body = await response.json();
      setSelected(body?.data ?? null);
      setNote("");
    } catch {
      toast.error("Could not open that application.");
    }
  }, []);

  const openDocument = useCallback(async (documentId: string) => {
    try {
      const response = await fetch(`/admin/installments/documents/${documentId}`, {
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body?.error?.message ?? "That document cannot be opened.");
        return;
      }
      window.open(
        `/admin/installments/documents/${documentId}?token=${encodeURIComponent(body.data.token)}`,
        "_blank",
        "noopener",
      );
    } catch {
      toast.error("Could not open that document.");
    }
  }, []);

  const decide = useCallback(
    async (decision: "approve" | "reject" | "request_information") => {
      if (!selected || note.trim().length < 4) return;
      setBusy(true);
      try {
        const response = await fetch(`/admin/installments/${selected.id}/decision`, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            // Fresh per click. A retry of the *same* click reuses it through the browser's
            // own retry, while a deliberate second decision is a different act.
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ decision, note: note.trim() }),
        });
        const body = await response.json();
        if (!response.ok) {
          toast.error(body?.error?.message ?? "That decision could not be recorded.");
          return;
        }
        toast.success(`${selected.reference} is now ${body.data.state.replace(/_/g, " ")}.`);
        setSelected(null);
        setNote("");
        await load();
      } catch {
        toast.error("That decision could not be recorded.");
      } finally {
        setBusy(false);
      }
    },
    [selected, note, load],
  );

  const queue = applications.filter((application) => OPEN_STATES.includes(application.state));
  const decided = applications.filter((application) => !OPEN_STATES.includes(application.state));

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Installment applications</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {queue.length} awaiting a decision
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {selected && (
        <div className="bg-ui-bg-subtle px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Heading level="h2">{selected.reference}</Heading>
              <Badge color={stateColour(selected.state)} size="small">
                {selected.state_label}
              </Badge>
            </div>
            <Button variant="transparent" size="small" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <Text weight="plus">Applicant</Text>
              <Text size="small">{selected.applicant.name}</Text>
              <Text size="small" className="text-ui-fg-subtle">
                CNIC {selected.applicant.cnic ?? selected.applicant.cnic_masked}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {selected.applicant.phone} · {selected.applicant.email}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {selected.applicant.employment_type.replace(/_/g, " ")} ·{" "}
                {rupees(selected.applicant.monthly_income_pkr)} a month
              </Text>
            </div>

            <div>
              <Text weight="plus">Guarantor</Text>
              <Text size="small">{selected.guarantor.name}</Text>
              <Text size="small" className="text-ui-fg-subtle">
                CNIC {selected.guarantor.cnic ?? selected.guarantor.cnic_masked}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {selected.guarantor.phone} · {selected.guarantor.relationship}
              </Text>
            </div>
          </div>

          {/*
            The same disclosure the customer saw, recomputed server-side. A reviewer decides
            against the figures the applicant agreed to, not against a summary of them.
          */}
          <div className="mt-6">
            <Text weight="plus">Plan agreed: {selected.plan.label}</Text>
            <Text size="small" className="text-ui-fg-subtle">
              Cash {rupees(selected.plan.cash_price_pkr)} · advance{" "}
              {rupees(selected.plan.advance_pkr)} · {rupees(selected.plan.monthly_pkr)} x{" "}
              {selected.plan.tenure_months} = {rupees(selected.plan.monthly_total_pkr)}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              Total {rupees(selected.plan.total_payable_pkr)} · {rupees(selected.plan.difference_pkr)}{" "}
              more than cash ({selected.plan.difference_percent}%)
            </Text>
          </div>

          <div className="mt-6">
            <Text weight="plus">Documents</Text>
            {(selected.documents ?? []).length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No documents attached.
              </Text>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {(selected.documents ?? []).map((document) => (
                  <li key={document.id}>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={!document.openable}
                      onClick={() => void openDocument(document.id)}
                    >
                      {DOCUMENT_LABEL[document.kind] ?? document.kind}
                      {document.deleted
                        ? " (deleted)"
                        : document.scan_status !== "clean"
                          ? ` (${document.scan_status})`
                          : ""}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Text size="small" className="text-ui-fg-subtle mt-2">
              A document that has not been scanned clean cannot be opened. Links last five
              minutes and every open is recorded.
            </Text>
          </div>

          {OPEN_STATES.includes(selected.state) && (
            <div className="mt-6">
              <Text weight="plus">Decision</Text>
              <Textarea
                className="mt-2"
                rows={3}
                value={note}
                placeholder="Why. This is recorded against the application."
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="small"
                  disabled={busy || note.trim().length < 4}
                  onClick={() => void decide("approve")}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  disabled={busy || note.trim().length < 4}
                  onClick={() => void decide("reject")}
                >
                  Reject
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={busy || note.trim().length < 4}
                  onClick={() => void decide("request_information")}
                >
                  Ask for more
                </Button>
              </div>
              <Text size="small" className="text-ui-fg-subtle mt-2">
                Approving releases the order for fulfilment. Rejecting cancels it and frees
                the handset. Neither takes any payment.
              </Text>
            </div>
          )}

          {(selected.audit ?? []).length > 0 && (
            <div className="mt-6">
              <Text weight="plus">History</Text>
              <ul className="mt-2 space-y-1">
                {(selected.audit ?? []).map((entry) => (
                  <li key={entry.id}>
                    <Text size="small" className="text-ui-fg-subtle">
                      {new Date(entry.created_at).toLocaleString("en-PK")} · {entry.action} ·{" "}
                      {entry.actor}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="px-6 py-4">
        <Text weight="plus" className="mb-3">
          Awaiting a decision
        </Text>
        {queue.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Nothing waiting.
          </Text>
        ) : (
          <ApplicationTable rows={queue} onOpen={open} />
        )}
      </div>

      {decided.length > 0 && (
        <div className="px-6 py-4">
          <Text weight="plus" className="mb-3">
            Decided
          </Text>
          <ApplicationTable rows={decided} onOpen={open} />
        </div>
      )}
    </Container>
  );
};

function ApplicationTable({
  rows,
  onOpen,
}: {
  rows: Application[];
  onOpen: (id: string) => Promise<void>;
}) {
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Reference</Table.HeaderCell>
          <Table.HeaderCell>Applicant</Table.HeaderCell>
          <Table.HeaderCell>CNIC</Table.HeaderCell>
          <Table.HeaderCell>Plan</Table.HeaderCell>
          <Table.HeaderCell>State</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((application) => (
          <Table.Row key={application.id}>
            <Table.Cell>{application.reference}</Table.Cell>
            <Table.Cell>{application.applicant.name}</Table.Cell>
            {/* Masked, always. The full value is one deliberate, audited click away. */}
            <Table.Cell>{application.applicant.cnic_masked ?? "deleted"}</Table.Cell>
            <Table.Cell>
              {rupees(application.plan.advance_pkr)} + {rupees(application.plan.monthly_pkr)} x{" "}
              {application.plan.tenure_months}
            </Table.Cell>
            <Table.Cell>
              <Badge color={stateColour(application.state)} size="small">
                {application.state_label}
              </Badge>
            </Table.Cell>
            <Table.Cell>
              <Button variant="secondary" size="small" onClick={() => void onOpen(application.id)}>
                Review
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

export const config = defineRouteConfig({
  label: "Installments",
});

export default InstallmentsPage;
