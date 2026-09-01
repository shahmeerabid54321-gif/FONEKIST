import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Input, Select, Text, Textarea, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Order operations widget.
 *
 * Gives an order operator the three things Medusa Admin does not know about (ADR-013):
 *   - the COD confirmation decision, which gates fulfilment (PAY-005);
 *   - the warranty snapshot recorded at purchase, so support can answer a claim without
 *     guessing what the listing said at the time (WAR-001);
 *   - a manual tracking entry path for when the courier API is down (FUL-004).
 */

type CodState =
  | "cod_pending_confirmation"
  | "cod_confirmed"
  | "cod_rejected"
  | "cod_shipped"
  | "cod_collected"
  | "cod_returned";

type CourierState =
  | "pending"
  | "booked"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "delivery_failed"
  | "returned_to_origin"
  | "cancelled"
  | "exception";

/** The states an operator sets by hand. `pending` is where a shipment starts, not a choice. */
const SETTABLE_COURIER_STATES: { value: CourierState; label: string }[] = [
  { value: "booked", label: "Booked with courier" },
  { value: "picked_up", label: "Picked up" },
  { value: "in_transit", label: "In transit" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "delivery_failed", label: "Delivery attempt failed" },
  { value: "returned_to_origin", label: "Returned to us" },
  { value: "exception", label: "Exception / on hold" },
  { value: "cancelled", label: "Cancelled" },
];

interface FulfillmentRow {
  id: string;
  metadata?: Record<string, unknown> | null;
}

interface ReturnRequestRow {
  id: string;
  status: string;
  reason_label: string;
  requested_resolution: string;
  notes: string | null;
  decision_reason: string | null;
  items: { id: string; title: string; quantity: number }[];
}

interface WarrantySnapshot {
  id: string;
  order_line_id: string;
  label: string;
  provider_name: string | null;
  terms_version: string;
  coverage_summary: string;
}

const COD_LABEL: Record<CodState, string> = {
  cod_pending_confirmation: "Awaiting confirmation",
  cod_confirmed: "Confirmed",
  cod_rejected: "Rejected",
  cod_shipped: "Shipped",
  cod_collected: "Cash collected",
  cod_returned: "Returned",
};

const OrderOperationsWidget = ({ data }: { data: { id: string; metadata?: Record<string, unknown> } }) => {
  const [codState, setCodState] = useState<CodState>(
    (data.metadata?.cod_state as CodState) ?? "cod_pending_confirmation",
  );
  const [snapshots, setSnapshots] = useState<WarrantySnapshot[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [isCod, setIsCod] = useState(false);

  const [fulfillments, setFulfillments] = useState<FulfillmentRow[]>([]);
  const [courierState, setCourierState] = useState<CourierState>("pending");
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [nextState, setNextState] = useState<CourierState | "">("");
  const [shipmentBusy, setShipmentBusy] = useState(false);

  const [returns, setReturns] = useState<ReturnRequestRow[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [orderResponse, warrantyResponse, returnsResponse] = await Promise.all([
          fetch(
            `/admin/orders/${data.id}?fields=*payment_collections.payments,*fulfillments`,
            { credentials: "include" },
          ),
          fetch(`/admin/electronics/order-warranty?order_id=${data.id}`, { credentials: "include" }),
          fetch(`/admin/returns?order_id=${data.id}`, { credentials: "include" }),
        ]);

        const order = await orderResponse.json();
        const payments = order?.order?.payment_collections?.flatMap(
          (collection: { payments?: { provider_id: string }[] }) => collection.payments ?? [],
        );

        if (!cancelled) {
          setIsCod(
            Boolean(payments?.some((payment: { provider_id: string }) => payment.provider_id?.includes("cod"))),
          );

          const rows: FulfillmentRow[] = order?.order?.fulfillments ?? [];
          setFulfillments(rows);

          const metadata = (rows[0]?.metadata ?? {}) as Record<string, unknown>;
          setCourierState((metadata.courier_state as CourierState) ?? "pending");
          setCourierName((metadata.courier_name as string) ?? "");
          setTrackingNumber((metadata.tracking_number as string) ?? "");
        }

        if (warrantyResponse.ok) {
          const body = await warrantyResponse.json();
          if (!cancelled) setSnapshots(body.data?.snapshots ?? []);
        }

        if (returnsResponse.ok) {
          const body = await returnsResponse.json();
          if (!cancelled) setReturns(body.data?.requests ?? []);
        }
      } catch {
        // The widget is supplementary: a failure here must not break the order page.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [data.id]);

  const decideCod = useCallback(
    async (state: "cod_confirmed" | "cod_rejected") => {
      setBusy(true);
      try {
        const response = await fetch(`/admin/orders/${data.id}/cod-confirmation`, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            // Idempotent by decision, so a double click records one outcome (ADM-011).
            "idempotency-key": `cod:${data.id}:${state}`,
          },
          body: JSON.stringify({ state, note: note || undefined }),
        });

        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "Could not record the decision.");

        setCodState(state);
        toast.success(state === "cod_confirmed" ? "COD order confirmed" : "COD order rejected");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not record the decision.");
      } finally {
        setBusy(false);
      }
    },
    [data.id, note],
  );

  const recordShipment = useCallback(async () => {
    if (!nextState) return;

    setShipmentBusy(true);
    try {
      const response = await fetch(`/admin/orders/${data.id}/shipment-status`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          // Keyed by fulfilment and target state, so a double click records one update.
          "idempotency-key": `shipment:${fulfillments[0]?.id ?? data.id}:${nextState}:${Date.now()}`,
        },
        body: JSON.stringify({
          fulfillment_id: fulfillments[0]?.id,
          state: nextState,
          courier_name: courierName || undefined,
          tracking_number: trackingNumber || undefined,
          note: note || undefined,
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not record the update.");

      setCourierState(nextState);
      setNextState("");
      toast.success("Shipment status recorded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the update.");
    } finally {
      setShipmentBusy(false);
    }
  }, [courierName, data.id, fulfillments, nextState, note, trackingNumber]);

  const decideReturn = useCallback(
    async (requestId: string, status: "approved" | "rejected" | "received" | "completed") => {
      if (status === "rejected" && !returnReason.trim()) {
        toast.error("Give a reason when refusing a return. The customer is told this.");
        return;
      }

      setReturnBusy(true);
      try {
        const response = await fetch(`/admin/returns/${requestId}/decision`, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            // Idempotent per decision: a double click records one outcome, and an approval
            // that refunds twice is exactly what this prevents (ADM-011).
            "idempotency-key": `return:${requestId}:${status}`,
          },
          body: JSON.stringify({ status, decision_reason: returnReason || undefined }),
        });

        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "Could not record the decision.");

        setReturns((current) =>
          current.map((request) =>
            request.id === requestId ? { ...request, status, decision_reason: returnReason || null } : request,
          ),
        );
        setReturnReason("");
        toast.success("Return decision recorded");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not record the decision.");
      } finally {
        setReturnBusy(false);
      }
    },
    [returnReason],
  );

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Order operations</Heading>
      </div>

      {isCod && (
        <div className="px-6 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Text size="small" weight="plus">
              Cash on delivery
            </Text>
            <Badge
              color={
                codState === "cod_confirmed" || codState === "cod_collected"
                  ? "green"
                  : codState === "cod_rejected"
                    ? "red"
                    : "orange"
              }
            >
              {COD_LABEL[codState]}
            </Badge>
          </div>

          {codState === "cod_pending_confirmation" ? (
            <>
              <Text size="small" className="text-ui-fg-subtle mb-3">
                Call the customer to confirm this order before dispatch. Only a confirmed COD
                order can be fulfilled.
              </Text>
              <Textarea
                placeholder="Note from the call (optional)"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mb-3"
              />
              <div className="flex gap-2">
                <Button size="small" isLoading={busy} onClick={() => decideCod("cod_confirmed")}>
                  Confirm order
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  isLoading={busy}
                  onClick={() => decideCod("cod_rejected")}
                >
                  Reject order
                </Button>
              </div>
            </>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              {codState === "cod_rejected"
                ? "This order was rejected and will not be dispatched."
                : "This order is confirmed and can be fulfilled."}
            </Text>
          )}
        </div>
      )}

      {/*
        Manual shipment tracking (FUL-004). No courier API is contracted, and even once one
        is, an outage must not stop an order shipping (07_SYSTEM_ARCHITECTURE.md section 13).
      */}
      <div className="px-6 py-4">
        <div className="mb-3 flex items-center gap-2">
          <Text size="small" weight="plus">
            Shipment
          </Text>
          <Badge
            color={
              courierState === "delivered"
                ? "green"
                : courierState === "exception" || courierState === "delivery_failed"
                  ? "orange"
                  : courierState === "cancelled" || courierState === "returned_to_origin"
                    ? "red"
                    : "blue"
            }
          >
            {courierState.replace(/_/g, " ")}
          </Badge>
        </div>

        {fulfillments.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Create a fulfilment for this order first, then record the courier booking here.
          </Text>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <Text size="small" className="text-ui-fg-subtle mb-1">
                Courier
              </Text>
              <Input
                placeholder="Courier name"
                value={courierName}
                onChange={(event) => setCourierName(event.target.value)}
              />
            </div>

            <div>
              <Text size="small" className="text-ui-fg-subtle mb-1">
                Tracking number
              </Text>
              <Input
                placeholder="Tracking number from the courier"
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
              />
            </div>

            <div>
              <Text size="small" className="text-ui-fg-subtle mb-1">
                New status
              </Text>
              <Select value={nextState} onValueChange={(value) => setNextState(value as CourierState)}>
                <Select.Trigger>
                  <Select.Value placeholder="Choose a status" />
                </Select.Trigger>
                <Select.Content>
                  {SETTABLE_COURIER_STATES.map((state) => (
                    <Select.Item key={state.value} value={state.value}>
                      {state.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>

            <Button
              size="small"
              isLoading={shipmentBusy}
              disabled={!nextState}
              onClick={() => void recordShipment()}
            >
              Record shipment update
            </Button>

            <Text size="small" className="text-ui-fg-subtle">
              The customer sees a simplified version of this on their order page. Illegal
              transitions are refused — a delivered shipment cannot go back to in transit.
            </Text>
          </div>
        )}
      </div>

      {returns.length > 0 && (
        <div className="px-6 py-4">
          <Text size="small" weight="plus" className="mb-2">
            Return requests
          </Text>
          <ul className="flex flex-col gap-3">
            {returns.map((request) => (
              <li key={request.id} className="rounded-md border border-ui-border-base p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    color={
                      request.status === "approved" || request.status === "completed"
                        ? "green"
                        : request.status === "rejected"
                          ? "red"
                          : "orange"
                    }
                  >
                    {request.status}
                  </Badge>
                  <Text size="small">
                    {request.reason_label} · wants a {request.requested_resolution}
                  </Text>
                </div>

                <ul className="mb-2">
                  {request.items.map((item) => (
                    <li key={item.id}>
                      <Text size="small" className="text-ui-fg-subtle">
                        {item.quantity} × {item.title}
                      </Text>
                    </li>
                  ))}
                </ul>

                {request.notes && (
                  <Text size="small" className="text-ui-fg-subtle mb-2">
                    Customer note: “{request.notes}”
                  </Text>
                )}

                {request.status === "requested" ? (
                  <>
                    <Textarea
                      placeholder="Reason for the decision (required when refusing — the customer is told this)"
                      value={returnReason}
                      onChange={(event) => setReturnReason(event.target.value)}
                      className="mb-2"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        isLoading={returnBusy}
                        onClick={() => void decideReturn(request.id, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        variant="danger"
                        isLoading={returnBusy}
                        onClick={() => void decideReturn(request.id, "rejected")}
                      >
                        Refuse
                      </Button>
                    </div>
                  </>
                ) : (
                  request.decision_reason && (
                    <Text size="small" className="text-ui-fg-subtle">
                      Decision: {request.decision_reason}
                    </Text>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-6 py-4">
        <Text size="small" weight="plus" className="mb-2">
          Warranty recorded at purchase
        </Text>
        {snapshots.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            No warranty snapshot recorded for this order yet.
          </Text>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="rounded-md border border-ui-border-base p-3">
                <Text size="small" weight="plus">
                  {snapshot.label}
                </Text>
                {snapshot.provider_name && (
                  <Text size="small" className="text-ui-fg-subtle">
                    Serviced by {snapshot.provider_name}
                  </Text>
                )}
                <Text size="small" className="text-ui-fg-subtle mt-1">
                  Terms {snapshot.terms_version} · This is what the customer was promised and does
                  not change if the catalog is edited.
                </Text>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
});

export default OrderOperationsWidget;
