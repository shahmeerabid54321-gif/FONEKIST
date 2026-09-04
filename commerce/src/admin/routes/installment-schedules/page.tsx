import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Switch, Table, Text, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * The default installment schedule (ADR-028, amending ADR-025).
 *
 * This is the schedule every handset is offered on unless somebody has overridden it for
 * one product or one storage tier, which is done on the product page rather than here.
 *
 * Three things about this screen are deliberate:
 *
 *  - **It shows rupees, not settings.** The monthly figure is rounded up to the nearest
 *    hundred, so a schedule set to 50% reaches the customer as 50.4% on one price and 51.1%
 *    on another. The preview is the number a customer would actually be shown (INST-004),
 *    priced against a sample handset, so nobody sets a schedule by its inputs alone.
 *  - **Saving here does not reprice the catalogue.** Rewriting every plan on every variant
 *    is a job, not a request. Run `pnpm installments:regenerate` afterwards, or reprice one
 *    product from its own page.
 *  - **Nothing here is a rate.** The advance is a share of the price paid up front and the
 *    markup is what is added for deferring the rest. Neither accrues and neither is
 *    annualised: this is a deferred-payment sale of goods, not a loan.
 */

interface Rule {
  tenure_months: number;
  advance_bps: number;
  markup_bps: number;
  active: boolean;
}

interface Disclosure {
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

interface Preview {
  cash_price_pkr: number;
  below_minimum: boolean;
  plans: Disclosure[];
}

const rupees = (amount: number): string => `Rs ${amount.toLocaleString("en-PK")}`;
const percent = (bps: number): string => (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1);
const toBps = (value: string): number => Math.round(Number(value) * 100);

const InstallmentSchedulesPage = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [defaults, setDefaults] = useState<Rule[]>([]);
  const [samplePrice, setSamplePrice] = useState("120000");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/admin/installments/rules?scope=global", {
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body?.error?.message ?? "Could not load the schedule.");
        return;
      }
      setDefaults(body?.data?.defaults ?? []);
      setRules((body?.data?.effective ?? []).filter((rule: Rule) => rule.active));
    } catch {
      toast.error("Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * The preview is fetched, never computed here.
   *
   * The rounding that turns a share into a monthly figure lives in one place, on the server,
   * and a screen that re-derived it in the browser would eventually disagree with the plans
   * actually written — which is the exact failure the disclosure rules exist to prevent.
   */
  useEffect(() => {
    if (rules.length === 0) return;
    const cash = Number(samplePrice.replace(/[^\d]/g, ""));
    if (!Number.isInteger(cash) || cash <= 0) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/admin/installments/rules/preview", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cash_prices_pkr: [cash], rules }),
        });
        const body = await response.json();
        if (!cancelled && response.ok) setPreview(body?.data?.prices?.[0] ?? null);
      } catch {
        // The preview is supplementary: a failure here must not block editing the schedule.
        if (!cancelled) setPreview(null);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rules, samplePrice]);

  const update = useCallback((tenure: number, patch: Partial<Rule>) => {
    setRules((current) =>
      current.map((rule) => (rule.tenure_months === tenure ? { ...rule, ...patch } : rule)),
    );
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/admin/installments/rules", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "global", scope_id: null, rules }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body?.error?.message ?? "That schedule could not be saved.");
        return;
      }
      toast.success("Saved. Run installments:regenerate to reprice the catalogue.");
      await load();
    } catch {
      toast.error("That schedule could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [rules, load]);

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Default installment schedule</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Applies to every handset unless a product or storage tier overrides it.
          </Text>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="small"
            disabled={loading || busy}
            onClick={() => setRules(defaults)}
          >
            Reset to built in
          </Button>
          <Button size="small" disabled={loading || busy || rules.length === 0} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>

      <div className="px-6 py-4">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Tenure</Table.HeaderCell>
              <Table.HeaderCell>Advance %</Table.HeaderCell>
              <Table.HeaderCell>Markup %</Table.HeaderCell>
              <Table.HeaderCell>Offered</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rules.map((rule) => (
              <Table.Row key={rule.tenure_months}>
                <Table.Cell>{rule.tenure_months} months</Table.Cell>
                <Table.Cell>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    step={0.1}
                    className="w-28"
                    value={percent(rule.advance_bps)}
                    onChange={(event) =>
                      update(rule.tenure_months, { advance_bps: toBps(event.target.value) })
                    }
                  />
                </Table.Cell>
                <Table.Cell>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    step={0.1}
                    className="w-28"
                    value={percent(rule.markup_bps)}
                    onChange={(event) =>
                      update(rule.tenure_months, { markup_bps: toBps(event.target.value) })
                    }
                  />
                </Table.Cell>
                <Table.Cell>
                  <Switch
                    checked={rule.active}
                    onCheckedChange={(checked) => update(rule.tenure_months, { active: checked })}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <Text size="small" className="text-ui-fg-subtle mt-3">
          The advance is a share of the cash price paid up front. The markup is what is added
          to the cash price for paying over time; it is not a rate, it does not accrue, and it
          is never shown to a customer as a percentage of anything but the total.
        </Text>
      </div>

      <div className="bg-ui-bg-subtle px-6 py-5">
        <div className="flex items-end gap-3">
          <div>
            <Text weight="plus">What a customer would see</Text>
            <Text size="small" className="text-ui-fg-subtle">
              Priced against a sample handset.
            </Text>
          </div>
          <Input
            type="number"
            className="w-40"
            value={samplePrice}
            onChange={(event) => setSamplePrice(event.target.value)}
          />
        </div>

        <div className="mt-4">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Plan</Table.HeaderCell>
                <Table.HeaderCell>Advance</Table.HeaderCell>
                <Table.HeaderCell>Monthly</Table.HeaderCell>
                <Table.HeaderCell>Total payable</Table.HeaderCell>
                <Table.HeaderCell>More than cash</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(preview?.plans ?? []).map((plan) => (
                <Table.Row key={plan.tenure_months}>
                  <Table.Cell>{plan.label}</Table.Cell>
                  <Table.Cell>{rupees(plan.advance_pkr)}</Table.Cell>
                  <Table.Cell>
                    {rupees(plan.monthly_pkr)} x {plan.tenure_months} ={" "}
                    {rupees(plan.monthly_total_pkr)}
                  </Table.Cell>
                  <Table.Cell>{rupees(plan.total_payable_pkr)}</Table.Cell>
                  <Table.Cell>
                    {rupees(plan.difference_pkr)} ({plan.difference_percent}%)
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          {preview?.below_minimum && (
            <Text size="small" className="text-ui-fg-subtle mt-3">
              No plan is offered below Rs 40,000. The paperwork costs more than the margin.
            </Text>
          )}
        </div>
      </div>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Installment schedule",
});

export default InstallmentSchedulesPage;
